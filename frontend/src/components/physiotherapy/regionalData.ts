export interface PhysioPainAssessment {
  score: number; // 0-10
  restScore?: number; // 0-10
  movementScore?: number; // 0-10
  palpationScore?: number; // 0-10
  characteristics?: string; // pontada, queimação, peso, latejante, etc.
  duration?: string; // aguda, subaguda, crônica, etc.
  aggravatingFactors?: string; // fatores de piora
  relievingFactors?: string; // fatores de melhora
  notes?: string;
}

export interface PhysioAdmItem {
  movement: string;
  normalRange: string;
  activeRom?: number | string; // graus
  passiveRom?: number | string; // graus
  painPresent?: boolean;
  notes?: string;
}

export interface PhysioStrengthItem {
  movementOrMuscle: string;
  grade: string; // '0', '1', '2', '3', '4-', '4', '4+', '5'
  notes?: string;
}

export interface PhysioSpecialTestItem {
  testName: string;
  targetStructure?: string;
  result: 'positive' | 'negative' | 'inconclusive' | 'not_tested';
  notes?: string;
}

export interface PhysioPalpationAssessment {
  muscleTone?: 'normal' | 'hypertonic' | 'hypotonic' | 'spasm';
  triggerPoints?: boolean;
  triggerPointLocations?: string;
  tenderness?: 'none' | 'mild' | 'moderate' | 'severe';
  localTemperature?: 'normal' | 'increased' | 'decreased';
  notes?: string;
}

export interface PhysioEdemaAssessment {
  present?: boolean;
  godetScale?: '0' | '1+' | '2+' | '3+' | '4+';
  perimetryCm?: number | string;
  notes?: string;
}

export interface PhysioFunctionalScaleItem {
  scaleName: string;
  score?: number | string;
  interpretation?: string;
}

export interface PhysioPlanLink {
  goal?: string;
  homeExercises?: string;
  reassessmentDate?: string;
  notes?: string;
}

export interface PhysioRegionalEvaluation {
  id: string;
  tenant_id: string;
  patient_id: string;
  professional_id: string;
  appointment_id?: string;
  region_id: string;
  region_label: string;
  side: 'right' | 'left' | 'midline';
  evaluation_date: string;
  pain_json?: PhysioPainAssessment | string;
  adm_json?: PhysioAdmItem[] | string;
  strength_json?: PhysioStrengthItem[] | string;
  tests_json?: PhysioSpecialTestItem[] | string;
  palpation_json?: PhysioPalpationAssessment | string;
  edema_json?: PhysioEdemaAssessment | string;
  functional_scales_json?: PhysioFunctionalScaleItem[] | string;
  plan_link_json?: PhysioPlanLink | string;
  notes?: string;
  professional_name?: string;
  created_at?: string;
}

export interface RegionalSummaryItem {
  region_id: string;
  region_label: string;
  side: string;
  evaluation_count: number;
  latest_pain_score: number | null;
  latest_evaluation_date: string;
}

export interface RegionalComparisonResult {
  region_id: string;
  region_label: string;
  side: string;
  baseline: PhysioRegionalEvaluation | null;
  current: PhysioRegionalEvaluation | null;
  variations: {
    painDiff: number | null;
    admDiffs: Array<{
      movement: string;
      baselineRom: number | null;
      currentRom: number | null;
      gain: number | null;
    }>;
    strengthDiffs: Array<{
      movement: string;
      baselineGrade: string | null;
      currentGrade: string | null;
    }>;
  };
  timeline: Array<{
    date: string;
    pain_score: number;
    evaluation_id: string;
  }>;
}

export interface JointMovementPreset {
  movement: string;
  normalRange: string;
}

export interface JointPresetConfig {
  jointName: string;
  defaultMovements: JointMovementPreset[];
  specialTests: Array<{ name: string; target: string }>;
  suggestedScales: string[];
}

export const REGIONAL_PRESETS: Record<string, JointPresetConfig> = {
  ombro: {
    jointName: 'Ombro',
    defaultMovements: [
      { movement: 'Flexão', normalRange: '0 - 180°' },
      { movement: 'Extensão', normalRange: '0 - 60°' },
      { movement: 'Abdução', normalRange: '0 - 180°' },
      { movement: 'Adução', normalRange: '0 - 40°' },
      { movement: 'Rotação Externa', normalRange: '0 - 90°' },
      { movement: 'Rotação Interna', normalRange: '0 - 70°' }
    ],
    specialTests: [
      { name: 'Teste de Neer', target: 'Impacto subacromial' },
      { name: 'Teste de Hawkins-Kennedy', target: 'Impacto subacromial / supraespinhal' },
      { name: 'Teste de Jobe (Empty Can)', target: 'Músculo supraespinhal' },
      { name: 'Teste de Speed', target: 'Tendão do bíceps braquial' },
      { name: 'Teste de Yergason', target: 'Tendão bicipital / ligamento umeral transverso' },
      { name: 'Teste de Patte', target: 'Músculo infraespinhal e redondo menor' },
      { name: 'Teste de Gerber (Lift-Off)', target: 'Músculo subescapular' },
      { name: 'Teste de Apreensão Anterior', target: 'Instabilidade glenoumeral anterior' }
    ],
    suggestedScales: ['SPADI', 'DASH / QuickDASH', 'Escala EVA']
  },
  joelho: {
    jointName: 'Joelho',
    defaultMovements: [
      { movement: 'Flexão', normalRange: '0 - 135°' },
      { movement: 'Extensão', normalRange: '0°' }
    ],
    specialTests: [
      { name: 'Teste de Lachman', target: 'Ligamento Cruzado Anterior (LCA)' },
      { name: 'Teste da Gaveta Anterior', target: 'Ligamento Cruzado Anterior (LCA)' },
      { name: 'Teste da Gaveta Posterior', target: 'Ligamento Cruzado Posterior (LCP)' },
      { name: 'Teste de McMurray', target: 'Lesão meniscal medial / lateral' },
      { name: 'Teste de Apley', target: 'Compressão e distração meniscal' },
      { name: 'Estresse em Valgo (0° e 30°)', target: 'Ligamento Colateral Medial (LCM)' },
      { name: 'Estresse em Varo (0° e 30°)', target: 'Ligamento Colateral Lateral (LCL)' },
      { name: 'Teste de Apreensão Patelar', target: 'Instabilidade fêmoro-patelar' }
    ],
    suggestedScales: ['Lysholm', 'LEFS (Lower Extremity Functional Scale)', 'KOOS', 'Escala EVA']
  },
  lombar: {
    jointName: 'Coluna Lombar',
    defaultMovements: [
      { movement: 'Flexão Anterior', normalRange: '0 - 60°' },
      { movement: 'Extensão', normalRange: '0 - 25°' },
      { movement: 'Inclinação Lateral Direita', normalRange: '0 - 25°' },
      { movement: 'Inclinação Lateral Esquerda', normalRange: '0 - 25°' },
      { movement: 'Rotação Axial Direita', normalRange: '0 - 30°' },
      { movement: 'Rotação Axial Esquerda', normalRange: '0 - 30°' }
    ],
    specialTests: [
      { name: 'Teste de Lasègue (SLR)', target: 'Radiculopatia ciática (L4-S1)' },
      { name: 'Teste de Bragard', target: 'Confirmação radicular ciática' },
      { name: 'Teste de Slump', target: 'Tensão neural dural' },
      { name: 'Teste de Schober', target: 'Mobilidade da coluna lombar' },
      { name: 'Teste de Patrick (FABERE)', target: 'Articulação sacroilíaca / quadril' },
      { name: 'Teste de Kemp', target: 'Sobrecarga facetária lombar' }
    ],
    suggestedScales: ['Roland-Morris', 'Oswestry (ODI)', 'Escala EVA']
  },
  cervical: {
    jointName: 'Coluna Cervical',
    defaultMovements: [
      { movement: 'Flexão', normalRange: '0 - 50°' },
      { movement: 'Extensão', normalRange: '0 - 60°' },
      { movement: 'Rotação Direita', normalRange: '0 - 80°' },
      { movement: 'Rotação Esquerda', normalRange: '0 - 80°' },
      { movement: 'Inclinação Lateral Direita', normalRange: '0 - 45°' },
      { movement: 'Inclinação Lateral Esquerda', normalRange: '0 - 45°' }
    ],
    specialTests: [
      { name: 'Teste de Spurling', target: 'Radiculopatia cervical' },
      { name: 'Teste de Distração Cervical', target: 'Alívio da compressão radicular' },
      { name: 'Teste de Compressão Cervical', target: 'Sobrecarga articular/radicular' },
      { name: 'Teste de Jackson', target: 'Compressão foraminal cervical' },
      { name: 'Teste de Adson', target: 'Síndrome do desfiladeiro torácico' },
      { name: 'Manobra de Valsalva', target: 'Pressão intratecal e radicular' }
    ],
    suggestedScales: ['NDI (Neck Disability Index)', 'Escala EVA']
  },
  quadril: {
    jointName: 'Quadril',
    defaultMovements: [
      { movement: 'Flexão', normalRange: '0 - 120°' },
      { movement: 'Extensão', normalRange: '0 - 30°' },
      { movement: 'Abdução', normalRange: '0 - 45°' },
      { movement: 'Adução', normalRange: '0 - 30°' },
      { movement: 'Rotação Interna', normalRange: '0 - 35°' },
      { movement: 'Rotação Externa', normalRange: '0 - 45°' }
    ],
    specialTests: [
      { name: 'Teste de Thomas', target: 'Encurtamento do músculo iliopsoas' },
      { name: 'Teste de Trendelenburg', target: 'Fraqueza do glúteo médio' },
      { name: 'Teste de Ober', target: 'Tensão do trato iliotibial / TFL' },
      { name: 'Teste de FABERE (Patrick)', target: 'Articulação do quadril e sacroilíaca' },
      { name: 'Teste de FADIR', target: 'Impacto femoroacetabular / lesão labral' }
    ],
    suggestedScales: ['Harris Hip Score (HHS)', 'LEFS', 'Escala EVA']
  },
  tornozelo: {
    jointName: 'Tornozelo e Pé',
    defaultMovements: [
      { movement: 'Dorsiflexão', normalRange: '0 - 20°' },
      { movement: 'Flexão Plantar', normalRange: '0 - 50°' },
      { movement: 'Inversão', normalRange: '0 - 35°' },
      { movement: 'Eversão', normalRange: '0 - 15°' }
    ],
    specialTests: [
      { name: 'Gaveta Anterior do Tornozelo', target: 'Ligamento Talofibular Anterior (LTFA)' },
      { name: 'Teste da Inclinação Talar (Talar Tilt)', target: 'Ligamento Calcaneofibular (LCF)' },
      { name: 'Teste de Thompson', target: 'Ruptura do tendão de Aquiles' },
      { name: 'Teste de Kleiger', target: 'Lesão sindesmótica do tornozelo' }
    ],
    suggestedScales: ['FAAM', 'AOFAS', 'LEFS', 'Escala EVA']
  },
  cotovelo: {
    jointName: 'Cotovelo e Antebraço',
    defaultMovements: [
      { movement: 'Flexão', normalRange: '0 - 145°' },
      { movement: 'Extensão', normalRange: '0°' },
      { movement: 'Pronação', normalRange: '0 - 80°' },
      { movement: 'Supinação', normalRange: '0 - 85°' }
    ],
    specialTests: [
      { name: 'Teste de Cozen', target: 'Epicondilite lateral (cotovelo de tenista)' },
      { name: 'Teste de Mill', target: 'Epicondilite lateral' },
      { name: 'Teste de Epicondilite Medial', target: 'Cotovelo de golfista' },
      { name: 'Sinal de Tinel no Cotovelo', target: 'Nervo ulnar no túnel cubital' }
    ],
    suggestedScales: ['DASH / QuickDASH', 'Escala EVA']
  },
  punho: {
    jointName: 'Punho e Mão',
    defaultMovements: [
      { movement: 'Flexão', normalRange: '0 - 80°' },
      { movement: 'Extensão', normalRange: '0 - 70°' },
      { movement: 'Desvio Radial', normalRange: '0 - 20°' },
      { movement: 'Desvio Ulnar', normalRange: '0 - 30°' }
    ],
    specialTests: [
      { name: 'Teste de Phalen', target: 'Síndrome do Túnel do Carpo / N. mediano' },
      { name: 'Sinal de Tinel (Punho)', target: 'Síndrome do Túnel do Carpo' },
      { name: 'Teste de Finkelstein', target: 'Tenossinovite de De Quervain' },
      { name: 'Sinal de Froment', target: 'Paresia do adutor do polegar / N. ulnar' }
    ],
    suggestedScales: ['Boston Carpal Tunnel Questionnaire (BCTQ)', 'DASH', 'Escala EVA']
  }
};

export function getJointConfigForRegion(regionId: string): JointPresetConfig {
  const lower = (regionId || '').toLowerCase();

  if (lower.includes('ombro') || lower.includes('shoulder')) return REGIONAL_PRESETS.ombro;
  if (lower.includes('joelho') || lower.includes('knee')) return REGIONAL_PRESETS.joelho;
  if (lower.includes('lombar') || lower.includes('lumbar')) return REGIONAL_PRESETS.lombar;
  if (lower.includes('cervical') || lower.includes('pescoco') || lower.includes('neck')) return REGIONAL_PRESETS.cervical;
  if (lower.includes('quadril') || lower.includes('hip') || lower.includes('pelve')) return REGIONAL_PRESETS.quadril;
  if (lower.includes('tornozelo') || lower.includes('ankle') || lower.includes('pe_') || lower.includes('foot')) return REGIONAL_PRESETS.tornozelo;
  if (lower.includes('cotovelo') || lower.includes('elbow')) return REGIONAL_PRESETS.cotovelo;
  if (lower.includes('punho') || lower.includes('wrist') || lower.includes('mao') || lower.includes('hand')) return REGIONAL_PRESETS.punho;

  // Fallback geral
  return {
    jointName: 'Articulação / Região',
    defaultMovements: [
      { movement: 'Flexão', normalRange: 'Livre / Indolor' },
      { movement: 'Extensão', normalRange: 'Livre / Indolor' },
      { movement: 'Rotação / Mobilidade', normalRange: 'Preservada' }
    ],
    specialTests: [
      { name: 'Teste Específico Regional', target: 'Avaliação da estrutura local' }
    ],
    suggestedScales: ['Escala EVA', 'Escala Funcional Específica do Paciente (PSFS)']
  };
}

export function detectSideFromRegionId(regionId: string): 'right' | 'left' | 'midline' {
  const lower = (regionId || '').toLowerCase();
  if (lower.includes('direito') || lower.includes('direita') || lower.includes('_right') || lower.includes('_d')) {
    return 'right';
  }
  if (lower.includes('esquerdo') || lower.includes('esquerda') || lower.includes('_left') || lower.includes('_e')) {
    return 'left';
  }
  return 'midline';
}

export function formatLaterality(side: string): string {
  switch (side) {
    case 'right': return 'Direito';
    case 'left': return 'Esquerdo';
    default: return 'Linha Média / Central';
  }
}

export function normalizeRegionalSummary(res: any): RegionalSummaryItem[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.summary)) return res.summary;
  if (Array.isArray(res.data)) return res.data;
  if (typeof res === 'object') {
    return Object.values(res)
      .filter((item: any) => item && typeof item === 'object' && typeof item.region_id === 'string')
      .map((item: any) => ({
        region_id: item.region_id,
        region_label: item.region_label || item.region_id,
        side: item.side || 'midline',
        evaluation_count: item.evaluation_count ?? item.count ?? 1,
        latest_pain_score: item.latest_pain_score !== undefined ? item.latest_pain_score : null,
        latest_evaluation_date: item.latest_evaluation_date || item.latest_date || ''
      }));
  }
  return [];
}

