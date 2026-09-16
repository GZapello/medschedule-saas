export interface BodyPanoramaRegion {
  id: string; // ex: 'frente_cabeca', 'frente_ombro_direito', 'verso_coluna_lombar'
  label: string; // ex: 'Cabeça (Frente)', 'Ombro Direito'
  baseRegion: string; // identificador canônico anatômico (ex: 'ombro_direito', 'joelho_esquerdo')
  region: string; // alias para compatibilidade com baseRegion
  view: 'front' | 'back' | 'left' | 'right';
  side: 'right' | 'left' | 'midline';
  shapeType: 'ellipse' | 'polygon';
  points?: string;
  ellipseCoords?: { cx: number; cy: number; rx: number; ry: number };
  center: { x: number; y: number };
  isJoint?: boolean; // indica se é articulação pontual
  muscleGroup?: string; // grupo muscular correspondente para volume de treino
}

// Compatibilidade retroativa de tipos
export type BodyRegionDef = BodyPanoramaRegion;

export interface CanonicalAnatomicalRegion {
  id: string;
  label: string;
  category: 'joint' | 'region' | 'muscle';
  side: 'right' | 'left' | 'midline';
  muscleGroup?: string;
}

// 24 ARTICULAÇÕES E REGIÕES OBRIGATÓRIAS + GRUPOS MUSCULARES
export const MANDATORY_ANATOMICAL_REGIONS: CanonicalAnatomicalRegion[] = [
  { id: 'cabeca', label: 'Cabeça', category: 'region', side: 'midline' },
  { id: 'pescoco', label: 'Pescoço', category: 'region', side: 'midline' },
  { id: 'ombro_direito', label: 'Ombro Direito', category: 'joint', side: 'right', muscleGroup: 'ombros' },
  { id: 'ombro_esquerdo', label: 'Ombro Esquerdo', category: 'joint', side: 'left', muscleGroup: 'ombros' },
  { id: 'cotovelo_direito', label: 'Cotovelo Direito', category: 'joint', side: 'right', muscleGroup: 'bracos' },
  { id: 'cotovelo_esquerdo', label: 'Cotovelo Esquerdo', category: 'joint', side: 'left', muscleGroup: 'bracos' },
  { id: 'punho_direito', label: 'Punho Direito', category: 'joint', side: 'right', muscleGroup: 'antebraco' },
  { id: 'punho_esquerdo', label: 'Punho Esquerdo', category: 'joint', side: 'left', muscleGroup: 'antebraco' },
  { id: 'dedos_mao_direita', label: 'Dedos da Mão Direita', category: 'joint', side: 'right', muscleGroup: 'antebraco' },
  { id: 'dedos_mao_esquerda', label: 'Dedos da Mão Esquerda', category: 'joint', side: 'left', muscleGroup: 'antebraco' },
  { id: 'coluna_cervical', label: 'Coluna Cervical', category: 'joint', side: 'midline' },
  { id: 'coluna_toracica', label: 'Coluna Torácica', category: 'joint', side: 'midline' },
  { id: 'coluna_lombar', label: 'Coluna Lombar', category: 'joint', side: 'midline', muscleGroup: 'lombar' },
  { id: 'pelve', label: 'Pelve', category: 'joint', side: 'midline' },
  { id: 'quadril_direito', label: 'Quadril Direito', category: 'joint', side: 'right', muscleGroup: 'gluteos' },
  { id: 'quadril_esquerdo', label: 'Quadril Esquerdo', category: 'joint', side: 'left', muscleGroup: 'gluteos' },
  { id: 'joelho_direito', label: 'Joelho Direito', category: 'joint', side: 'right', muscleGroup: 'quadriceps' },
  { id: 'joelho_esquerdo', label: 'Joelho Esquerdo', category: 'joint', side: 'left', muscleGroup: 'quadriceps' },
  { id: 'tornozelo_direito', label: 'Tornozelo Direito', category: 'joint', side: 'right', muscleGroup: 'panturrilhas' },
  { id: 'tornozelo_esquerdo', label: 'Tornozelo Esquerdo', category: 'joint', side: 'left', muscleGroup: 'panturrilhas' },
  { id: 'pe_direito', label: 'Pé Direito', category: 'region', side: 'right', muscleGroup: 'panturrilhas' },
  { id: 'pe_esquerdo', label: 'Pé Esquerdo', category: 'region', side: 'left', muscleGroup: 'panturrilhas' },
  { id: 'dedos_pe_direito', label: 'Dedos do Pé Direito', category: 'joint', side: 'right' },
  { id: 'dedos_pe_esquerdo', label: 'Dedos do Pé Esquerdo', category: 'joint', side: 'left' },
  // Grupos musculares amplos
  { id: 'peitoral', label: 'Peitoral', category: 'muscle', side: 'midline', muscleGroup: 'peitoral' },
  { id: 'costas', label: 'Costas / Dorsais', category: 'muscle', side: 'midline', muscleGroup: 'costas' },
  { id: 'trapezio', label: 'Trapézio', category: 'muscle', side: 'midline', muscleGroup: 'costas' },
  { id: 'biceps_direito', label: 'Bíceps Direito', category: 'muscle', side: 'right', muscleGroup: 'biceps' },
  { id: 'biceps_esquerdo', label: 'Bíceps Esquerdo', category: 'muscle', side: 'left', muscleGroup: 'biceps' },
  { id: 'triceps_direito', label: 'Tríceps Direito', category: 'muscle', side: 'right', muscleGroup: 'triceps' },
  { id: 'triceps_esquerdo', label: 'Tríceps Esquerdo', category: 'muscle', side: 'left', muscleGroup: 'triceps' },
  { id: 'antebraco_direito', label: 'Antebraço Direito', category: 'muscle', side: 'right', muscleGroup: 'antebraco' },
  { id: 'antebraco_esquerdo', label: 'Antebraço Esquerdo', category: 'muscle', side: 'left', muscleGroup: 'antebraco' },
  { id: 'abdomen', label: 'Abdômen', category: 'muscle', side: 'midline', muscleGroup: 'abdomen' },
  { id: 'lombar', label: 'Lombar', category: 'muscle', side: 'midline', muscleGroup: 'lombar' },
  { id: 'gluteos', label: 'Glúteos', category: 'muscle', side: 'midline', muscleGroup: 'gluteos' },
  { id: 'quadriceps_direito', label: 'Quadríceps Direito', category: 'muscle', side: 'right', muscleGroup: 'quadriceps' },
  { id: 'quadriceps_esquerdo', label: 'Quadríceps Esquerdo', category: 'muscle', side: 'left', muscleGroup: 'quadriceps' },
  { id: 'posteriores_direito', label: 'Posteriores Coxa Direito', category: 'muscle', side: 'right', muscleGroup: 'posteriores' },
  { id: 'posteriores_esquerdo', label: 'Posteriores Coxa Esquerdo', category: 'muscle', side: 'left', muscleGroup: 'posteriores' },
  { id: 'adutores', label: 'Adutores', category: 'muscle', side: 'midline', muscleGroup: 'adutores' },
  { id: 'abdutores', label: 'Abdutores', category: 'muscle', side: 'midline', muscleGroup: 'abdutores' },
  { id: 'panturrilha_direita', label: 'Panturrilha Direita', category: 'muscle', side: 'right', muscleGroup: 'panturrilhas' },
  { id: 'panturrilha_esquerda', label: 'Panturrilha Esquerda', category: 'muscle', side: 'left', muscleGroup: 'panturrilhas' }
];

// Gerador padronizado de regiões com base em coordenadas anatômicas
function buildRegionsCatalog(isFemale: boolean): BodyPanoramaRegion[] {
  const shoulderOffset = isFemale ? 3 : 0;

  return [
    // =========================================================================
    // 1. VISTA FRONTAL (X: ~0 a 280, Centro: 158)
    // =========================================================================
    {
      id: 'frente_cabeca',
      label: 'Cabeça (Frente)',
      baseRegion: 'cabeca',
      region: 'cabeca',
      view: 'front',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 158, cy: 65, rx: 32, ry: 42 },
      center: { x: 158, y: 65 }
    },
    {
      id: 'frente_pescoco',
      label: 'Pescoço (Frente)',
      baseRegion: 'pescoco',
      region: 'pescoco',
      view: 'front',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 158, cy: 110, rx: 20, ry: 12 },
      center: { x: 158, y: 110 }
    },
    {
      id: 'frente_ombro_direito',
      label: 'Ombro Direito (Frente)',
      baseRegion: 'ombro_direito',
      region: 'ombro_direito',
      view: 'front',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 95 + shoulderOffset, cy: 140, rx: 18, ry: 18 },
      center: { x: 95 + shoulderOffset, y: 140 },
      isJoint: true,
      muscleGroup: 'ombros'
    },
    {
      id: 'frente_ombro_esquerdo',
      label: 'Ombro Esquerdo (Frente)',
      baseRegion: 'ombro_esquerdo',
      region: 'ombro_esquerdo',
      view: 'front',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 221 - shoulderOffset, cy: 140, rx: 18, ry: 18 },
      center: { x: 221 - shoulderOffset, y: 140 },
      isJoint: true,
      muscleGroup: 'ombros'
    },
    {
      id: 'frente_peitoral',
      label: 'Peitoral / Tórax (Frente)',
      baseRegion: 'peitoral',
      region: 'peitoral',
      view: 'front',
      side: 'midline',
      shapeType: 'polygon',
      points: '124,120 192,120 206,172 200,218 116,218 110,172',
      center: { x: 158, y: 169 },
      muscleGroup: 'peitoral'
    },
    {
      id: 'frente_biceps_direito',
      label: 'Bíceps Direito (Frente)',
      baseRegion: 'biceps_direito',
      region: 'biceps_direito',
      view: 'front',
      side: 'right',
      shapeType: 'polygon',
      points: '72,172 108,172 98,240 58,240',
      center: { x: 84, y: 206 },
      muscleGroup: 'biceps'
    },
    {
      id: 'frente_biceps_esquerdo',
      label: 'Bíceps Esquerdo (Frente)',
      baseRegion: 'biceps_esquerdo',
      region: 'biceps_esquerdo',
      view: 'front',
      side: 'left',
      shapeType: 'polygon',
      points: '208,172 244,172 258,240 218,240',
      center: { x: 232, y: 206 },
      muscleGroup: 'biceps'
    },
    {
      id: 'frente_cotovelo_direito',
      label: 'Cotovelo Direito (Frente)',
      baseRegion: 'cotovelo_direito',
      region: 'cotovelo_direito',
      view: 'front',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 76, cy: 248, rx: 15, ry: 15 },
      center: { x: 76, y: 248 },
      isJoint: true,
      muscleGroup: 'bracos'
    },
    {
      id: 'frente_cotovelo_esquerdo',
      label: 'Cotovelo Esquerdo (Frente)',
      baseRegion: 'cotovelo_esquerdo',
      region: 'cotovelo_esquerdo',
      view: 'front',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 240, cy: 248, rx: 15, ry: 15 },
      center: { x: 240, y: 248 },
      isJoint: true,
      muscleGroup: 'bracos'
    },
    {
      id: 'frente_antebraco_direito',
      label: 'Antebraço Direito (Frente)',
      baseRegion: 'antebraco_direito',
      region: 'antebraco_direito',
      view: 'front',
      side: 'right',
      shapeType: 'polygon',
      points: '58,252 98,252 86,325 44,325',
      center: { x: 72, y: 288 },
      muscleGroup: 'antebraco'
    },
    {
      id: 'frente_antebraco_esquerdo',
      label: 'Antebraço Esquerdo (Frente)',
      baseRegion: 'antebraco_esquerdo',
      region: 'antebraco_esquerdo',
      view: 'front',
      side: 'left',
      shapeType: 'polygon',
      points: '218,252 258,252 272,325 230,325',
      center: { x: 244, y: 288 },
      muscleGroup: 'antebraco'
    },
    {
      id: 'frente_punho_direito',
      label: 'Punho Direito (Frente)',
      baseRegion: 'punho_direito',
      region: 'punho_direito',
      view: 'front',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 58, cy: 334, rx: 14, ry: 14 },
      center: { x: 58, y: 334 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'frente_punho_esquerdo',
      label: 'Punho Esquerdo (Frente)',
      baseRegion: 'punho_esquerdo',
      region: 'punho_esquerdo',
      view: 'front',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 258, cy: 334, rx: 14, ry: 14 },
      center: { x: 258, y: 334 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'frente_dedos_mao_direita',
      label: 'Dedos da Mão Direita (Frente)',
      baseRegion: 'dedos_mao_direita',
      region: 'dedos_mao_direita',
      view: 'front',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 48, cy: 380, rx: 16, ry: 18 },
      center: { x: 48, y: 380 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'frente_dedos_mao_esquerda',
      label: 'Dedos da Mão Esquerda (Frente)',
      baseRegion: 'dedos_mao_esquerda',
      region: 'dedos_mao_esquerda',
      view: 'front',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 268, cy: 380, rx: 16, ry: 18 },
      center: { x: 268, y: 380 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'frente_abdomen',
      label: 'Abdômen (Frente)',
      baseRegion: 'abdomen',
      region: 'abdomen',
      view: 'front',
      side: 'midline',
      shapeType: 'polygon',
      points: '116,218 200,218 208,285 206,330 110,330 108,285',
      center: { x: 158, y: 274 },
      muscleGroup: 'abdomen'
    },
    {
      id: 'frente_pelve',
      label: 'Pelve (Frente)',
      baseRegion: 'pelve',
      region: 'pelve',
      view: 'front',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 158, cy: 335, rx: 36, ry: 18 },
      center: { x: 158, y: 335 },
      isJoint: true
    },
    {
      id: 'frente_quadril_direito',
      label: 'Quadril Direito (Frente)',
      baseRegion: 'quadril_direito',
      region: 'quadril_direito',
      view: 'front',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 122, cy: 345, rx: 17, ry: 17 },
      center: { x: 122, y: 345 },
      isJoint: true,
      muscleGroup: 'gluteos'
    },
    {
      id: 'frente_quadril_esquerdo',
      label: 'Quadril Esquerdo (Frente)',
      baseRegion: 'quadril_esquerdo',
      region: 'quadril_esquerdo',
      view: 'front',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 194, cy: 345, rx: 17, ry: 17 },
      center: { x: 194, y: 345 },
      isJoint: true,
      muscleGroup: 'gluteos'
    },
    {
      id: 'frente_quadriceps_direito',
      label: 'Quadríceps Direito (Frente)',
      baseRegion: 'quadriceps_direito',
      region: 'quadriceps_direito',
      view: 'front',
      side: 'right',
      shapeType: 'polygon',
      points: '104,345 154,345 152,470 96,470',
      center: { x: 126, y: 407 },
      muscleGroup: 'quadriceps'
    },
    {
      id: 'frente_quadriceps_esquerdo',
      label: 'Quadríceps Esquerdo (Frente)',
      baseRegion: 'quadriceps_esquerdo',
      region: 'quadriceps_esquerdo',
      view: 'front',
      side: 'left',
      shapeType: 'polygon',
      points: '162,345 212,345 220,470 164,470',
      center: { x: 189, y: 407 },
      muscleGroup: 'quadriceps'
    },
    {
      id: 'frente_joelho_direito',
      label: 'Joelho Direito (Frente)',
      baseRegion: 'joelho_direito',
      region: 'joelho_direito',
      view: 'front',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 124, cy: 485, rx: 17, ry: 17 },
      center: { x: 124, y: 485 },
      isJoint: true,
      muscleGroup: 'quadriceps'
    },
    {
      id: 'frente_joelho_esquerdo',
      label: 'Joelho Esquerdo (Frente)',
      baseRegion: 'joelho_esquerdo',
      region: 'joelho_esquerdo',
      view: 'front',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 192, cy: 485, rx: 17, ry: 17 },
      center: { x: 192, y: 485 },
      isJoint: true,
      muscleGroup: 'quadriceps'
    },
    {
      id: 'frente_panturrilha_direita',
      label: 'Canela / Panturrilha Direita (Frente)',
      baseRegion: 'panturrilha_direita',
      region: 'panturrilha_direita',
      view: 'front',
      side: 'right',
      shapeType: 'polygon',
      points: '96,500 152,500 142,615 84,615',
      center: { x: 118, y: 557 },
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'frente_panturrilha_esquerda',
      label: 'Canela / Panturrilha Esquerda (Frente)',
      baseRegion: 'panturrilha_esquerda',
      region: 'panturrilha_esquerda',
      view: 'front',
      side: 'left',
      shapeType: 'polygon',
      points: '164,500 220,500 232,615 174,615',
      center: { x: 198, y: 557 },
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'frente_tornozelo_direito',
      label: 'Tornozelo Direito (Frente)',
      baseRegion: 'tornozelo_direito',
      region: 'tornozelo_direito',
      view: 'front',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 114, cy: 625, rx: 15, ry: 15 },
      center: { x: 114, y: 625 },
      isJoint: true,
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'frente_tornozelo_esquerdo',
      label: 'Tornozelo Esquerdo (Frente)',
      baseRegion: 'tornozelo_esquerdo',
      region: 'tornozelo_esquerdo',
      view: 'front',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 202, cy: 625, rx: 15, ry: 15 },
      center: { x: 202, y: 625 },
      isJoint: true,
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'frente_pe_direito',
      label: 'Pé Direito (Frente)',
      baseRegion: 'pe_direito',
      region: 'pe_direito',
      view: 'front',
      side: 'right',
      shapeType: 'polygon',
      points: '84,635 142,635 140,670 60,670',
      center: { x: 106, y: 652 },
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'frente_pe_esquerdo',
      label: 'Pé Esquerdo (Frente)',
      baseRegion: 'pe_esquerdo',
      region: 'pe_esquerdo',
      view: 'front',
      side: 'left',
      shapeType: 'polygon',
      points: '174,635 232,635 256,670 176,670',
      center: { x: 210, y: 652 },
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'frente_dedos_pe_direito',
      label: 'Dedos do Pé Direito (Frente)',
      baseRegion: 'dedos_pe_direito',
      region: 'dedos_pe_direito',
      view: 'front',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 100, cy: 678, rx: 14, ry: 10 },
      center: { x: 100, y: 678 },
      isJoint: true
    },
    {
      id: 'frente_dedos_pe_esquerdo',
      label: 'Dedos do Pé Esquerdo (Frente)',
      baseRegion: 'dedos_pe_esquerdo',
      region: 'dedos_pe_esquerdo',
      view: 'front',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 216, cy: 678, rx: 14, ry: 10 },
      center: { x: 216, y: 678 },
      isJoint: true
    },

    // =========================================================================
    // 2. VISTA POSTERIOR / VERSO (X: ~280 a 580, Centro: 445)
    // =========================================================================
    {
      id: 'verso_cabeca',
      label: 'Cabeça (Verso)',
      baseRegion: 'cabeca',
      region: 'cabeca',
      view: 'back',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 445, cy: 65, rx: 32, ry: 42 },
      center: { x: 445, y: 65 }
    },
    {
      id: 'verso_pescoco',
      label: 'Pescoço (Verso)',
      baseRegion: 'pescoco',
      region: 'pescoco',
      view: 'back',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 445, cy: 105, rx: 20, ry: 12 },
      center: { x: 445, y: 105 }
    },
    {
      id: 'verso_coluna_cervical',
      label: 'Coluna Cervical',
      baseRegion: 'coluna_cervical',
      region: 'coluna_cervical',
      view: 'back',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 445, cy: 118, rx: 16, ry: 15 },
      center: { x: 445, y: 118 },
      isJoint: true
    },
    {
      id: 'verso_ombro_esquerdo',
      label: 'Ombro Esquerdo (Verso)',
      baseRegion: 'ombro_esquerdo',
      region: 'ombro_esquerdo',
      view: 'back',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 382, cy: 140, rx: 18, ry: 18 },
      center: { x: 382, y: 140 },
      isJoint: true,
      muscleGroup: 'ombros'
    },
    {
      id: 'verso_ombro_direito',
      label: 'Ombro Direito (Verso)',
      baseRegion: 'ombro_direito',
      region: 'ombro_direito',
      view: 'back',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 508, cy: 140, rx: 18, ry: 18 },
      center: { x: 508, y: 140 },
      isJoint: true,
      muscleGroup: 'ombros'
    },
    {
      id: 'verso_costas',
      label: 'Costas / Dorsal (Verso)',
      baseRegion: 'costas',
      region: 'costas',
      view: 'back',
      side: 'midline',
      shapeType: 'polygon',
      points: '411,120 479,120 493,172 487,235 403,235 397,172',
      center: { x: 445, y: 177 },
      muscleGroup: 'costas'
    },
    {
      id: 'verso_coluna_toracica',
      label: 'Coluna Torácica',
      baseRegion: 'coluna_toracica',
      region: 'coluna_toracica',
      view: 'back',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 445, cy: 185, rx: 16, ry: 24 },
      center: { x: 445, y: 185 },
      isJoint: true
    },
    {
      id: 'verso_triceps_esquerdo',
      label: 'Tríceps Esquerdo (Verso)',
      baseRegion: 'triceps_esquerdo',
      region: 'triceps_esquerdo',
      view: 'back',
      side: 'left',
      shapeType: 'polygon',
      points: '359,172 395,172 385,240 345,240',
      center: { x: 371, y: 206 },
      muscleGroup: 'triceps'
    },
    {
      id: 'verso_triceps_direito',
      label: 'Tríceps Direito (Verso)',
      baseRegion: 'triceps_direito',
      region: 'triceps_direito',
      view: 'back',
      side: 'right',
      shapeType: 'polygon',
      points: '495,172 531,172 545,240 505,240',
      center: { x: 519, y: 206 },
      muscleGroup: 'triceps'
    },
    {
      id: 'verso_cotovelo_esquerdo',
      label: 'Cotovelo Esquerdo (Verso)',
      baseRegion: 'cotovelo_esquerdo',
      region: 'cotovelo_esquerdo',
      view: 'back',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 355, cy: 248, rx: 15, ry: 15 },
      center: { x: 355, y: 248 },
      isJoint: true,
      muscleGroup: 'bracos'
    },
    {
      id: 'verso_cotovelo_direito',
      label: 'Cotovelo Direito (Verso)',
      baseRegion: 'cotovelo_direito',
      region: 'cotovelo_direito',
      view: 'back',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 535, cy: 248, rx: 15, ry: 15 },
      center: { x: 535, y: 248 },
      isJoint: true,
      muscleGroup: 'bracos'
    },
    {
      id: 'verso_antebraco_esquerdo',
      label: 'Antebraço Esquerdo (Verso)',
      baseRegion: 'antebraco_esquerdo',
      region: 'antebraco_esquerdo',
      view: 'back',
      side: 'left',
      shapeType: 'polygon',
      points: '345,252 385,252 373,325 331,325',
      center: { x: 358, y: 288 },
      muscleGroup: 'antebraco'
    },
    {
      id: 'verso_antebraco_direito',
      label: 'Antebraço Direito (Verso)',
      baseRegion: 'antebraco_direito',
      region: 'antebraco_direito',
      view: 'back',
      side: 'right',
      shapeType: 'polygon',
      points: '505,252 545,252 559,325 517,325',
      center: { x: 531, y: 288 },
      muscleGroup: 'antebraco'
    },
    {
      id: 'verso_punho_esquerdo',
      label: 'Punho Esquerdo (Verso)',
      baseRegion: 'punho_esquerdo',
      region: 'punho_esquerdo',
      view: 'back',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 338, cy: 334, rx: 14, ry: 14 },
      center: { x: 338, y: 334 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'verso_punho_direito',
      label: 'Punho Direito (Verso)',
      baseRegion: 'punho_direito',
      region: 'punho_direito',
      view: 'back',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 552, cy: 334, rx: 14, ry: 14 },
      center: { x: 552, y: 334 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'verso_dedos_mao_esquerda',
      label: 'Dedos da Mão Esquerda (Verso)',
      baseRegion: 'dedos_mao_esquerda',
      region: 'dedos_mao_esquerda',
      view: 'back',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 326, cy: 380, rx: 16, ry: 18 },
      center: { x: 326, y: 380 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'verso_dedos_mao_direita',
      label: 'Dedos da Mão Direita (Verso)',
      baseRegion: 'dedos_mao_direita',
      region: 'dedos_mao_direita',
      view: 'back',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 564, cy: 380, rx: 16, ry: 18 },
      center: { x: 564, y: 380 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'verso_coluna_lombar',
      label: 'Coluna Lombar',
      baseRegion: 'coluna_lombar',
      region: 'coluna_lombar',
      view: 'back',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 445, cy: 265, rx: 16, ry: 20 },
      center: { x: 445, y: 265 },
      isJoint: true,
      muscleGroup: 'lombar'
    },
    {
      id: 'verso_gluteos',
      label: 'Glúteos (Verso)',
      baseRegion: 'gluteos',
      region: 'gluteos',
      view: 'back',
      side: 'midline',
      shapeType: 'polygon',
      points: '403,235 487,235 498,285 498,340 392,340 392,285',
      center: { x: 445, y: 287 },
      muscleGroup: 'gluteos'
    },
    {
      id: 'verso_quadril_esquerdo',
      label: 'Quadril Esquerdo (Verso)',
      baseRegion: 'quadril_esquerdo',
      region: 'quadril_esquerdo',
      view: 'back',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 408, cy: 345, rx: 17, ry: 17 },
      center: { x: 408, y: 345 },
      isJoint: true,
      muscleGroup: 'gluteos'
    },
    {
      id: 'verso_quadril_direito',
      label: 'Quadril Direito (Verso)',
      baseRegion: 'quadril_direito',
      region: 'quadril_direito',
      view: 'back',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 482, cy: 345, rx: 17, ry: 17 },
      center: { x: 482, y: 345 },
      isJoint: true,
      muscleGroup: 'gluteos'
    },
    {
      id: 'verso_posteriores_esquerdo',
      label: 'Posteriores Coxa Esquerdo (Verso)',
      baseRegion: 'posteriores_esquerdo',
      region: 'posteriores_esquerdo',
      view: 'back',
      side: 'left',
      shapeType: 'polygon',
      points: '392,345 442,345 440,470 384,470',
      center: { x: 414, y: 407 },
      muscleGroup: 'posteriores'
    },
    {
      id: 'verso_posteriores_direito',
      label: 'Posteriores Coxa Direito (Verso)',
      baseRegion: 'posteriores_direito',
      region: 'posteriores_direito',
      view: 'back',
      side: 'right',
      shapeType: 'polygon',
      points: '448,345 498,345 506,470 450,470',
      center: { x: 476, y: 407 },
      muscleGroup: 'posteriores'
    },
    {
      id: 'verso_joelho_esquerdo',
      label: 'Joelho Esquerdo (Verso)',
      baseRegion: 'joelho_esquerdo',
      region: 'joelho_esquerdo',
      view: 'back',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 412, cy: 485, rx: 17, ry: 17 },
      center: { x: 412, y: 485 },
      isJoint: true,
      muscleGroup: 'posteriores'
    },
    {
      id: 'verso_joelho_direito',
      label: 'Joelho Direito (Verso)',
      baseRegion: 'joelho_direito',
      region: 'joelho_direito',
      view: 'back',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 478, cy: 485, rx: 17, ry: 17 },
      center: { x: 478, y: 485 },
      isJoint: true,
      muscleGroup: 'posteriores'
    },
    {
      id: 'verso_panturrilha_esquerda',
      label: 'Panturrilha Esquerda (Verso)',
      baseRegion: 'panturrilha_esquerda',
      region: 'panturrilha_esquerda',
      view: 'back',
      side: 'left',
      shapeType: 'polygon',
      points: '384,500 440,500 432,615 374,615',
      center: { x: 407, y: 557 },
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'verso_panturrilha_direita',
      label: 'Panturrilha Direita (Verso)',
      baseRegion: 'panturrilha_direita',
      region: 'panturrilha_direita',
      view: 'back',
      side: 'right',
      shapeType: 'polygon',
      points: '450,500 506,500 516,615 458,615',
      center: { x: 483, y: 557 },
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'verso_tornozelo_esquerdo',
      label: 'Tornozelo Esquerdo (Verso)',
      baseRegion: 'tornozelo_esquerdo',
      region: 'tornozelo_esquerdo',
      view: 'back',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 412, cy: 625, rx: 15, ry: 15 },
      center: { x: 412, y: 625 },
      isJoint: true,
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'verso_tornozelo_direito',
      label: 'Tornozelo Direito (Verso)',
      baseRegion: 'tornozelo_direito',
      region: 'tornozelo_direito',
      view: 'back',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 478, cy: 625, rx: 15, ry: 15 },
      center: { x: 478, y: 625 },
      isJoint: true,
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'verso_pe_esquerdo',
      label: 'Pé Esquerdo (Verso)',
      baseRegion: 'pe_esquerdo',
      region: 'pe_esquerdo',
      view: 'back',
      side: 'left',
      shapeType: 'polygon',
      points: '374,635 432,635 430,680 350,680',
      center: { x: 396, y: 657 },
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'verso_pe_direito',
      label: 'Pé Direito (Verso)',
      baseRegion: 'pe_direito',
      region: 'pe_direito',
      view: 'back',
      side: 'right',
      shapeType: 'polygon',
      points: '458,635 516,635 540,680 460,680',
      center: { x: 494, y: 657 },
      muscleGroup: 'panturrilhas'
    },

    // =========================================================================
    // 3. VISTA LATERAL ESQUERDA (X: ~580 a 780, Centro: ~695)
    // =========================================================================
    {
      id: 'perfil_esq_cabeca',
      label: 'Cabeça (Lateral Esquerda)',
      baseRegion: 'cabeca',
      region: 'cabeca',
      view: 'left',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 695, cy: 65, rx: 32, ry: 42 },
      center: { x: 695, y: 65 }
    },
    {
      id: 'perfil_esq_pescoco',
      label: 'Pescoço (Lateral Esquerda)',
      baseRegion: 'pescoco',
      region: 'pescoco',
      view: 'left',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 695, cy: 105, rx: 20, ry: 12 },
      center: { x: 695, y: 105 }
    },
    {
      id: 'perfil_esq_coluna_cervical',
      label: 'Coluna Cervical (Lateral Esquerda)',
      baseRegion: 'coluna_cervical',
      region: 'coluna_cervical',
      view: 'left',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 680, cy: 112, rx: 14, ry: 14 },
      center: { x: 680, y: 112 },
      isJoint: true
    },
    {
      id: 'perfil_esq_ombro_esquerdo',
      label: 'Ombro Esquerdo (Lateral)',
      baseRegion: 'ombro_esquerdo',
      region: 'ombro_esquerdo',
      view: 'left',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 695, cy: 140, rx: 18, ry: 18 },
      center: { x: 695, y: 140 },
      isJoint: true,
      muscleGroup: 'ombros'
    },
    {
      id: 'perfil_esq_coluna_toracica',
      label: 'Coluna Torácica (Lateral Esquerda)',
      baseRegion: 'coluna_toracica',
      region: 'coluna_toracica',
      view: 'left',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 672, cy: 185, rx: 14, ry: 22 },
      center: { x: 672, y: 185 },
      isJoint: true
    },
    {
      id: 'perfil_esq_cotovelo_esquerdo',
      label: 'Cotovelo Esquerdo (Lateral)',
      baseRegion: 'cotovelo_esquerdo',
      region: 'cotovelo_esquerdo',
      view: 'left',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 695, cy: 248, rx: 15, ry: 15 },
      center: { x: 695, y: 248 },
      isJoint: true,
      muscleGroup: 'bracos'
    },
    {
      id: 'perfil_esq_coluna_lombar',
      label: 'Coluna Lombar (Lateral Esquerda)',
      baseRegion: 'coluna_lombar',
      region: 'coluna_lombar',
      view: 'left',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 672, cy: 265, rx: 14, ry: 18 },
      center: { x: 672, y: 265 },
      isJoint: true,
      muscleGroup: 'lombar'
    },
    {
      id: 'perfil_esq_punho_esquerdo',
      label: 'Punho Esquerdo (Lateral)',
      baseRegion: 'punho_esquerdo',
      region: 'punho_esquerdo',
      view: 'left',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 695, cy: 334, rx: 14, ry: 14 },
      center: { x: 695, y: 334 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'perfil_esq_dedos_mao_esquerda',
      label: 'Dedos da Mão Esquerda (Lateral)',
      baseRegion: 'dedos_mao_esquerda',
      region: 'dedos_mao_esquerda',
      view: 'left',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 695, cy: 378, rx: 16, ry: 18 },
      center: { x: 695, y: 378 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'perfil_esq_pelve',
      label: 'Pelve (Lateral Esquerda)',
      baseRegion: 'pelve',
      region: 'pelve',
      view: 'left',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 690, cy: 330, rx: 28, ry: 18 },
      center: { x: 690, y: 330 },
      isJoint: true
    },
    {
      id: 'perfil_esq_quadril_esquerdo',
      label: 'Quadril Esquerdo (Lateral)',
      baseRegion: 'quadril_esquerdo',
      region: 'quadril_esquerdo',
      view: 'left',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 695, cy: 345, rx: 17, ry: 17 },
      center: { x: 695, y: 345 },
      isJoint: true,
      muscleGroup: 'gluteos'
    },
    {
      id: 'perfil_esq_joelho_esquerdo',
      label: 'Joelho Esquerdo (Lateral)',
      baseRegion: 'joelho_esquerdo',
      region: 'joelho_esquerdo',
      view: 'left',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 695, cy: 485, rx: 17, ry: 17 },
      center: { x: 695, y: 485 },
      isJoint: true,
      muscleGroup: 'quadriceps'
    },
    {
      id: 'perfil_esq_tornozelo_esquerdo',
      label: 'Tornozelo Esquerdo (Lateral)',
      baseRegion: 'tornozelo_esquerdo',
      region: 'tornozelo_esquerdo',
      view: 'left',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 690, cy: 625, rx: 15, ry: 15 },
      center: { x: 690, y: 625 },
      isJoint: true,
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'perfil_esq_pe_esquerdo',
      label: 'Pé Esquerdo (Lateral)',
      baseRegion: 'pe_esquerdo',
      region: 'pe_esquerdo',
      view: 'left',
      side: 'left',
      shapeType: 'polygon',
      points: '670,635 730,635 745,682 660,682',
      center: { x: 700, y: 658 },
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'perfil_esq_dedos_pe_esquerdo',
      label: 'Dedos do Pé Esquerdo (Lateral)',
      baseRegion: 'dedos_pe_esquerdo',
      region: 'dedos_pe_esquerdo',
      view: 'left',
      side: 'left',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 735, cy: 675, rx: 14, ry: 10 },
      center: { x: 735, y: 675 },
      isJoint: true
    },

    // =========================================================================
    // 4. VISTA LATERAL DIREITA (X: ~780 a 1024, Centro: ~865)
    // =========================================================================
    {
      id: 'perfil_dir_cabeca',
      label: 'Cabeça (Lateral Direita)',
      baseRegion: 'cabeca',
      region: 'cabeca',
      view: 'right',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 865, cy: 65, rx: 32, ry: 42 },
      center: { x: 865, y: 65 }
    },
    {
      id: 'perfil_dir_pescoco',
      label: 'Pescoço (Lateral Direita)',
      baseRegion: 'pescoco',
      region: 'pescoco',
      view: 'right',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 865, cy: 105, rx: 20, ry: 12 },
      center: { x: 865, y: 105 }
    },
    {
      id: 'perfil_dir_coluna_cervical',
      label: 'Coluna Cervical (Lateral Direita)',
      baseRegion: 'coluna_cervical',
      region: 'coluna_cervical',
      view: 'right',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 880, cy: 112, rx: 14, ry: 14 },
      center: { x: 880, y: 112 },
      isJoint: true
    },
    {
      id: 'perfil_dir_ombro_direito',
      label: 'Ombro Direito (Lateral)',
      baseRegion: 'ombro_direito',
      region: 'ombro_direito',
      view: 'right',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 865, cy: 140, rx: 18, ry: 18 },
      center: { x: 865, y: 140 },
      isJoint: true,
      muscleGroup: 'ombros'
    },
    {
      id: 'perfil_dir_coluna_toracica',
      label: 'Coluna Torácica (Lateral Direita)',
      baseRegion: 'coluna_toracica',
      region: 'coluna_toracica',
      view: 'right',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 888, cy: 185, rx: 14, ry: 22 },
      center: { x: 888, y: 185 },
      isJoint: true
    },
    {
      id: 'perfil_dir_cotovelo_direito',
      label: 'Cotovelo Direito (Lateral)',
      baseRegion: 'cotovelo_direito',
      region: 'cotovelo_direito',
      view: 'right',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 860, cy: 248, rx: 15, ry: 15 },
      center: { x: 860, y: 248 },
      isJoint: true,
      muscleGroup: 'bracos'
    },
    {
      id: 'perfil_dir_coluna_lombar',
      label: 'Coluna Lombar (Lateral Direita)',
      baseRegion: 'coluna_lombar',
      region: 'coluna_lombar',
      view: 'right',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 888, cy: 265, rx: 14, ry: 18 },
      center: { x: 888, y: 265 },
      isJoint: true,
      muscleGroup: 'lombar'
    },
    {
      id: 'perfil_dir_punho_direito',
      label: 'Punho Direito (Lateral)',
      baseRegion: 'punho_direito',
      region: 'punho_direito',
      view: 'right',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 860, cy: 334, rx: 14, ry: 14 },
      center: { x: 860, y: 334 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'perfil_dir_dedos_mao_direito',
      label: 'Dedos da Mão Direita (Lateral)',
      baseRegion: 'dedos_mao_direita',
      region: 'dedos_mao_direita',
      view: 'right',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 860, cy: 378, rx: 16, ry: 18 },
      center: { x: 860, y: 378 },
      isJoint: true,
      muscleGroup: 'antebraco'
    },
    {
      id: 'perfil_dir_pelve',
      label: 'Pelve (Lateral Direita)',
      baseRegion: 'pelve',
      region: 'pelve',
      view: 'right',
      side: 'midline',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 870, cy: 330, rx: 28, ry: 18 },
      center: { x: 870, y: 330 },
      isJoint: true
    },
    {
      id: 'perfil_dir_quadril_direito',
      label: 'Quadril Direito (Lateral)',
      baseRegion: 'quadril_direito',
      region: 'quadril_direito',
      view: 'right',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 865, cy: 345, rx: 17, ry: 17 },
      center: { x: 865, y: 345 },
      isJoint: true,
      muscleGroup: 'gluteos'
    },
    {
      id: 'perfil_dir_joelho_direito',
      label: 'Joelho Direito (Lateral)',
      baseRegion: 'joelho_direito',
      region: 'joelho_direito',
      view: 'right',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 865, cy: 485, rx: 17, ry: 17 },
      center: { x: 865, y: 485 },
      isJoint: true,
      muscleGroup: 'quadriceps'
    },
    {
      id: 'perfil_dir_tornozelo_direito',
      label: 'Tornozelo Direito (Lateral)',
      baseRegion: 'tornozelo_direito',
      region: 'tornozelo_direito',
      view: 'right',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 870, cy: 625, rx: 15, ry: 15 },
      center: { x: 870, y: 625 },
      isJoint: true,
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'perfil_dir_pe_direito',
      label: 'Pé Direito (Lateral)',
      baseRegion: 'pe_direito',
      region: 'pe_direito',
      view: 'right',
      side: 'right',
      shapeType: 'polygon',
      points: '840,635 900,635 935,682 830,682',
      center: { x: 875, y: 658 },
      muscleGroup: 'panturrilhas'
    },
    {
      id: 'perfil_dir_dedos_pe_direito',
      label: 'Dedos do Pé Direito (Lateral)',
      baseRegion: 'dedos_pe_direito',
      region: 'dedos_pe_direito',
      view: 'right',
      side: 'right',
      shapeType: 'ellipse',
      ellipseCoords: { cx: 840, cy: 675, rx: 14, ry: 10 },
      center: { x: 840, y: 675 },
      isJoint: true
    }
  ];
}

export const PANORAMA_REGIONS_MALE: BodyPanoramaRegion[] = buildRegionsCatalog(false);
export const PANORAMA_REGIONS_FEMALE: BodyPanoramaRegion[] = buildRegionsCatalog(true);

// Dicionário por modelo corporal
export function getPanoramaRegions(model: 'female' | 'male'): BodyPanoramaRegion[] {
  return model === 'female' ? PANORAMA_REGIONS_FEMALE : PANORAMA_REGIONS_MALE;
}

// Obter label amigável pelo ID ou baseRegion
export function getRegionLabel(regionId: string, model: 'female' | 'male' = 'male'): string {
  const list = getPanoramaRegions(model);
  const found = list.find(r => r.id === regionId || r.baseRegion === regionId || r.region === regionId);
  if (found) return found.label;

  const canon = MANDATORY_ANATOMICAL_REGIONS.find(m => m.id === regionId);
  if (canon) return canon.label;

  // Fallback legível se não encontrar
  const parts = regionId.split('_');
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
