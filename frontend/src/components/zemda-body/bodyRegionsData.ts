export interface BodyPanoramaRegion {
  id: string; // ex: 'frente_cabeca', 'frente_braco_direito', 'verso_gluteos'
  label: string; // ex: 'Cabeça (Frente)', 'Braço Direito (Frente)'
  baseRegion: string; // cabeca, ombro, braco, antebraco, mao, torax, abdomen, gluteos, perna, canela, pe
  region: string; // alias para baseRegion
  view: 'front' | 'back' | 'left' | 'right';
  side: 'right' | 'left' | 'midline';
  shapeType: 'ellipse' | 'polygon';
  points?: string;
  ellipseCoords?: { cx: number; cy: number; rx: number; ry: number };
  center: { x: number; y: number };
}

// Compatibilidade retroativa de tipos
export type BodyRegionDef = BodyPanoramaRegion;

// =============================================================================
// CATÁLOGO DE REGIÕES PANORÂMICAS: MODELO MASCULINO (1024 x 768)
// =============================================================================
export const PANORAMA_REGIONS_MALE: BodyPanoramaRegion[] = [
  // --- 1. FRENTE ---
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
    id: 'frente_ombro_direito',
    label: 'Ombro Direito (Frente)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'front',
    side: 'right', // Paciente direito = tela esquerda
    shapeType: 'polygon',
    points: '130,118 80,138 72,172 108,172 134,136',
    center: { x: 105, y: 145 }
  },
  {
    id: 'frente_ombro_esquerdo',
    label: 'Ombro Esquerdo (Frente)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'front',
    side: 'left', // Paciente esquerdo = tela direita
    shapeType: 'polygon',
    points: '186,118 236,138 244,172 208,172 182,136',
    center: { x: 211, y: 145 }
  },
  {
    id: 'frente_braco_direito',
    label: 'Braço Direito (Frente)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '72,172 108,172 98,252 58,252',
    center: { x: 84, y: 212 }
  },
  {
    id: 'frente_braco_esquerdo',
    label: 'Braço Esquerdo (Frente)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '208,172 244,172 258,252 218,252',
    center: { x: 232, y: 212 }
  },
  {
    id: 'frente_antebraco_direito',
    label: 'Antebraço Direito (Frente)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '58,252 98,252 86,332 44,332',
    center: { x: 72, y: 292 }
  },
  {
    id: 'frente_antebraco_esquerdo',
    label: 'Antebraço Esquerdo (Frente)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '218,252 258,252 272,332 230,332',
    center: { x: 244, y: 292 }
  },
  {
    id: 'frente_mao_direita',
    label: 'Mão Direita (Frente)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '44,332 86,332 78,395 24,395',
    center: { x: 58, y: 363 }
  },
  {
    id: 'frente_mao_esquerda',
    label: 'Mão Esquerda (Frente)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '230,332 272,332 292,395 238,395',
    center: { x: 258, y: 363 }
  },
  {
    id: 'frente_torax',
    label: 'Tórax / Peitoral (Frente)',
    baseRegion: 'torax',
    region: 'torax',
    view: 'front',
    side: 'midline',
    shapeType: 'polygon',
    points: '124,120 192,120 206,172 200,218 116,218 110,172',
    center: { x: 158, y: 169 }
  },
  {
    id: 'frente_abdomen',
    label: 'Barriga / Abdômen (Frente)',
    baseRegion: 'abdomen',
    region: 'abdomen',
    view: 'front',
    side: 'midline',
    shapeType: 'polygon',
    points: '116,218 200,218 208,285 206,340 110,340 108,285',
    center: { x: 158, y: 279 }
  },
  {
    id: 'frente_perna_direita',
    label: 'Perna Direita (Frente)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '104,340 154,340 152,475 96,475',
    center: { x: 126, y: 407 }
  },
  {
    id: 'frente_perna_esquerda',
    label: 'Perna Esquerda (Frente)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '162,340 212,340 220,475 164,475',
    center: { x: 189, y: 407 }
  },
  {
    id: 'frente_canela_direita',
    label: 'Canela Direita (Frente)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '96,475 152,475 142,630 84,630',
    center: { x: 118, y: 552 }
  },
  {
    id: 'frente_canela_esquerda',
    label: 'Canela Esquerda (Frente)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '164,475 220,475 232,630 174,630',
    center: { x: 198, y: 552 }
  },
  {
    id: 'frente_pe_direito',
    label: 'Pé Direito (Frente)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '84,630 142,630 140,682 60,682',
    center: { x: 106, y: 656 }
  },
  {
    id: 'frente_pe_esquerdo',
    label: 'Pé Esquerdo (Frente)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '174,630 232,630 256,682 176,682',
    center: { x: 210, y: 656 }
  },

  // --- 2. VERSO ---
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
    id: 'verso_ombro_esquerdo',
    label: 'Ombro Esquerdo (Verso)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'back',
    side: 'left', // Paciente esquerdo = tela esquerda
    shapeType: 'polygon',
    points: '417,118 367,138 359,172 395,172 421,136',
    center: { x: 391, y: 145 }
  },
  {
    id: 'verso_ombro_direito',
    label: 'Ombro Direito (Verso)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'back',
    side: 'right', // Paciente direito = tela direita
    shapeType: 'polygon',
    points: '473,118 523,138 531,172 495,172 469,136',
    center: { x: 499, y: 145 }
  },
  {
    id: 'verso_braco_esquerdo',
    label: 'Braço Esquerdo (Verso)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '359,172 395,172 385,252 345,252',
    center: { x: 371, y: 212 }
  },
  {
    id: 'verso_braco_direito',
    label: 'Braço Direito (Verso)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '495,172 531,172 545,252 505,252',
    center: { x: 519, y: 212 }
  },
  {
    id: 'verso_antebraco_esquerdo',
    label: 'Antebraço Esquerdo (Verso)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '345,252 385,252 373,332 331,332',
    center: { x: 358, y: 292 }
  },
  {
    id: 'verso_antebraco_direito',
    label: 'Antebraço Direito (Verso)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '505,252 545,252 559,332 517,332',
    center: { x: 531, y: 292 }
  },
  {
    id: 'verso_mao_esquerda',
    label: 'Mão Esquerda (Verso)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '331,332 373,332 365,395 311,395',
    center: { x: 345, y: 363 }
  },
  {
    id: 'verso_mao_direita',
    label: 'Mão Direita (Verso)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '517,332 559,332 579,395 525,395',
    center: { x: 545, y: 363 }
  },
  {
    id: 'verso_torax',
    label: 'Costas / Tórax Posterior (Verso)',
    baseRegion: 'torax',
    region: 'torax',
    view: 'back',
    side: 'midline',
    shapeType: 'polygon',
    points: '411,120 479,120 493,172 487,235 403,235 397,172',
    center: { x: 445, y: 177 }
  },
  {
    id: 'verso_gluteos',
    label: 'Glúteos / Lombar (Verso)',
    baseRegion: 'gluteos',
    region: 'gluteos',
    view: 'back',
    side: 'midline',
    shapeType: 'polygon',
    points: '403,235 487,235 498,285 498,340 392,340 392,285',
    center: { x: 445, y: 287 }
  },
  {
    id: 'verso_perna_esquerda',
    label: 'Perna Esquerda (Verso)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '392,340 442,340 440,475 384,475',
    center: { x: 414, y: 407 }
  },
  {
    id: 'verso_perna_direita',
    label: 'Perna Direita (Verso)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '448,340 498,340 506,475 450,475',
    center: { x: 476, y: 407 }
  },
  {
    id: 'verso_canela_esquerda',
    label: 'Canela / Panturrilha Esquerda (Verso)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '384,475 440,475 430,630 372,630',
    center: { x: 406, y: 552 }
  },
  {
    id: 'verso_canela_direita',
    label: 'Canela / Panturrilha Direita (Verso)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '450,475 506,475 518,630 460,630',
    center: { x: 484, y: 552 }
  },
  {
    id: 'verso_pe_esquerdo',
    label: 'Pé Esquerdo (Verso)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '372,630 430,630 428,682 348,682',
    center: { x: 395, y: 656 }
  },
  {
    id: 'verso_pe_direito',
    label: 'Pé Direito (Verso)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '460,630 518,630 542,682 462,682',
    center: { x: 495, y: 656 }
  },

  // --- 3. PERFIL ESQUERDO ---
  {
    id: 'perfil_esq_cabeca',
    label: 'Cabeça (Perfil Esquerdo)',
    baseRegion: 'cabeca',
    region: 'cabeca',
    view: 'left',
    side: 'left',
    shapeType: 'ellipse',
    ellipseCoords: { cx: 702, cy: 65, rx: 34, ry: 42 },
    center: { x: 702, y: 65 }
  },
  {
    id: 'perfil_esq_ombro',
    label: 'Ombro (Perfil Esquerdo)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '680,120 725,120 735,160 690,160',
    center: { x: 707, y: 140 }
  },
  {
    id: 'perfil_esq_braco',
    label: 'Braço (Perfil Esquerdo)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '690,160 735,160 730,245 685,245',
    center: { x: 710, y: 202 }
  },
  {
    id: 'perfil_esq_antebraco',
    label: 'Antebraço (Perfil Esquerdo)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '685,245 730,245 725,325 680,325',
    center: { x: 705, y: 285 }
  },
  {
    id: 'perfil_esq_mao',
    label: 'Mão (Perfil Esquerdo)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '680,325 725,325 715,385 665,385',
    center: { x: 696, y: 355 }
  },
  {
    id: 'perfil_esq_torax',
    label: 'Tórax (Perfil Esquerdo)',
    baseRegion: 'torax',
    region: 'torax',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '658,145 710,145 715,220 660,220',
    center: { x: 686, y: 182 }
  },
  {
    id: 'perfil_esq_abdomen',
    label: 'Barriga / Abdômen (Perfil Esquerdo)',
    baseRegion: 'abdomen',
    region: 'abdomen',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '660,220 715,220 718,315 662,315',
    center: { x: 689, y: 267 }
  },
  {
    id: 'perfil_esq_gluteos',
    label: 'Glúteo (Perfil Esquerdo)',
    baseRegion: 'gluteos',
    region: 'gluteos',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '716,245 745,265 745,335 715,335',
    center: { x: 730, y: 290 }
  },
  {
    id: 'perfil_esq_perna',
    label: 'Perna (Perfil Esquerdo)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '668,335 738,335 735,475 672,475',
    center: { x: 703, y: 405 }
  },
  {
    id: 'perfil_esq_canela',
    label: 'Canela / Panturrilha (Perfil Esquerdo)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '672,475 735,475 732,630 680,630',
    center: { x: 705, y: 552 }
  },
  {
    id: 'perfil_esq_pe',
    label: 'Pé (Perfil Esquerdo)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '680,630 732,630 735,682 620,682',
    center: { x: 692, y: 656 }
  },

  // --- 4. PERFIL DIREITO ---
  {
    id: 'perfil_dir_cabeca',
    label: 'Cabeça (Perfil Direito)',
    baseRegion: 'cabeca',
    region: 'cabeca',
    view: 'right',
    side: 'right',
    shapeType: 'ellipse',
    ellipseCoords: { cx: 895, cy: 65, rx: 34, ry: 42 },
    center: { x: 895, y: 65 }
  },
  {
    id: 'perfil_dir_ombro',
    label: 'Ombro (Perfil Direito)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '875,120 920,120 930,160 885,160',
    center: { x: 902, y: 140 }
  },
  {
    id: 'perfil_dir_braco',
    label: 'Braço (Perfil Direito)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '885,160 930,160 925,245 880,245',
    center: { x: 905, y: 202 }
  },
  {
    id: 'perfil_dir_antebraco',
    label: 'Antebraço (Perfil Direito)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '880,245 925,245 920,325 875,325',
    center: { x: 900, y: 285 }
  },
  {
    id: 'perfil_dir_mao',
    label: 'Mão (Perfil Direito)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '875,325 920,325 910,385 860,385',
    center: { x: 891, y: 355 }
  },
  {
    id: 'perfil_dir_torax',
    label: 'Tórax (Perfil Direito)',
    baseRegion: 'torax',
    region: 'torax',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '845,145 897,145 902,220 847,220',
    center: { x: 873, y: 182 }
  },
  {
    id: 'perfil_dir_abdomen',
    label: 'Barriga / Abdômen (Perfil Direito)',
    baseRegion: 'abdomen',
    region: 'abdomen',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '847,220 902,220 905,315 849,315',
    center: { x: 876, y: 267 }
  },
  {
    id: 'perfil_dir_gluteos',
    label: 'Glúteo (Perfil Direito)',
    baseRegion: 'gluteos',
    region: 'gluteos',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '818,245 847,265 847,335 818,335',
    center: { x: 832, y: 290 }
  },
  {
    id: 'perfil_dir_perna',
    label: 'Perna (Perfil Direito)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '855,335 925,335 922,475 859,475',
    center: { x: 890, y: 405 }
  },
  {
    id: 'perfil_dir_canela',
    label: 'Canela / Panturrilha (Perfil Direito)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '859,475 922,475 919,630 867,630',
    center: { x: 892, y: 552 }
  },
  {
    id: 'perfil_dir_pe',
    label: 'Pé (Perfil Direito)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '867,630 919,630 965,682 850,682',
    center: { x: 900, y: 656 }
  }
];

// =============================================================================
// CATÁLOGO DE REGIÕES PANORÂMICAS: MODELO FEMININO (1024 x 768)
// =============================================================================
export const PANORAMA_REGIONS_FEMALE: BodyPanoramaRegion[] = [
  // --- 1. FRENTE ---
  {
    id: 'frente_cabeca',
    label: 'Cabeça (Frente)',
    baseRegion: 'cabeca',
    region: 'cabeca',
    view: 'front',
    side: 'midline',
    shapeType: 'ellipse',
    ellipseCoords: { cx: 160, cy: 65, rx: 32, ry: 42 },
    center: { x: 160, y: 65 }
  },
  {
    id: 'frente_ombro_direito',
    label: 'Ombro Direito (Frente)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '135,122 88,140 80,170 114,170 138,138',
    center: { x: 109, y: 148 }
  },
  {
    id: 'frente_ombro_esquerdo',
    label: 'Ombro Esquerdo (Frente)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '185,122 232,140 240,170 206,170 182,138',
    center: { x: 211, y: 148 }
  },
  {
    id: 'frente_braco_direito',
    label: 'Braço Direito (Frente)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '80,170 114,170 106,248 68,248',
    center: { x: 92, y: 209 }
  },
  {
    id: 'frente_braco_esquerdo',
    label: 'Braço Esquerdo (Frente)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '206,170 240,170 252,248 214,248',
    center: { x: 228, y: 209 }
  },
  {
    id: 'frente_antebraco_direito',
    label: 'Antebraço Direito (Frente)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '68,248 106,248 94,325 54,325',
    center: { x: 80, y: 286 }
  },
  {
    id: 'frente_antebraco_esquerdo',
    label: 'Antebraço Esquerdo (Frente)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '214,248 252,248 266,325 226,325',
    center: { x: 240, y: 286 }
  },
  {
    id: 'frente_mao_direita',
    label: 'Mão Direita (Frente)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '54,325 94,325 86,390 35,390',
    center: { x: 67, y: 357 }
  },
  {
    id: 'frente_mao_esquerda',
    label: 'Mão Esquerda (Frente)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '226,325 266,325 285,390 234,390',
    center: { x: 253, y: 357 }
  },
  {
    id: 'frente_torax',
    label: 'Tórax / Peitoral (Frente)',
    baseRegion: 'torax',
    region: 'torax',
    view: 'front',
    side: 'midline',
    shapeType: 'polygon',
    points: '126,122 194,122 208,170 200,215 120,215 112,170',
    center: { x: 160, y: 168 }
  },
  {
    id: 'frente_abdomen',
    label: 'Barriga / Abdômen (Frente)',
    baseRegion: 'abdomen',
    region: 'abdomen',
    view: 'front',
    side: 'midline',
    shapeType: 'polygon',
    points: '120,215 200,215 208,285 206,335 114,335 112,285',
    center: { x: 160, y: 275 }
  },
  {
    id: 'frente_perna_direita',
    label: 'Perna Direita (Frente)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '104,335 155,335 152,475 98,475',
    center: { x: 127, y: 405 }
  },
  {
    id: 'frente_perna_esquerda',
    label: 'Perna Esquerda (Frente)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '165,335 216,335 222,475 168,475',
    center: { x: 193, y: 405 }
  },
  {
    id: 'frente_canela_direita',
    label: 'Canela Direita (Frente)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '98,475 152,475 145,625 90,625',
    center: { x: 121, y: 550 }
  },
  {
    id: 'frente_canela_esquerda',
    label: 'Canela Esquerda (Frente)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '168,475 222,475 230,625 175,625',
    center: { x: 199, y: 550 }
  },
  {
    id: 'frente_pe_direito',
    label: 'Pé Direito (Frente)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'front',
    side: 'right',
    shapeType: 'polygon',
    points: '90,625 145,625 146,685 75,685',
    center: { x: 114, y: 655 }
  },
  {
    id: 'frente_pe_esquerdo',
    label: 'Pé Esquerdo (Frente)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'front',
    side: 'left',
    shapeType: 'polygon',
    points: '175,625 230,625 245,685 174,685',
    center: { x: 206, y: 655 }
  },

  // --- 2. VERSO ---
  {
    id: 'verso_cabeca',
    label: 'Cabeça (Verso)',
    baseRegion: 'cabeca',
    region: 'cabeca',
    view: 'back',
    side: 'midline',
    shapeType: 'ellipse',
    ellipseCoords: { cx: 406, cy: 65, rx: 32, ry: 42 },
    center: { x: 406, y: 65 }
  },
  {
    id: 'verso_ombro_esquerdo',
    label: 'Ombro Esquerdo (Verso)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '381,122 334,140 326,170 360,170 384,138',
    center: { x: 357, y: 148 }
  },
  {
    id: 'verso_ombro_direito',
    label: 'Ombro Direito (Verso)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '431,122 478,140 486,170 452,170 428,138',
    center: { x: 459, y: 148 }
  },
  {
    id: 'verso_braco_esquerdo',
    label: 'Braço Esquerdo (Verso)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '326,170 360,170 352,248 314,248',
    center: { x: 338, y: 209 }
  },
  {
    id: 'verso_braco_direito',
    label: 'Braço Direito (Verso)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '452,170 486,170 498,248 460,248',
    center: { x: 474, y: 209 }
  },
  {
    id: 'verso_antebraco_esquerdo',
    label: 'Antebraço Esquerdo (Verso)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '314,248 352,248 340,325 300,325',
    center: { x: 326, y: 286 }
  },
  {
    id: 'verso_antebraco_direito',
    label: 'Antebraço Direito (Verso)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '460,248 498,248 512,325 472,325',
    center: { x: 486, y: 286 }
  },
  {
    id: 'verso_mao_esquerda',
    label: 'Mão Esquerda (Verso)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '300,325 340,325 332,390 281,390',
    center: { x: 313, y: 357 }
  },
  {
    id: 'verso_mao_direita',
    label: 'Mão Direita (Verso)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '472,325 512,325 531,390 480,390',
    center: { x: 499, y: 357 }
  },
  {
    id: 'verso_torax',
    label: 'Costas / Tórax Posterior (Verso)',
    baseRegion: 'torax',
    region: 'torax',
    view: 'back',
    side: 'midline',
    shapeType: 'polygon',
    points: '372,122 440,122 454,170 448,225 364,225 358,170',
    center: { x: 406, y: 173 }
  },
  {
    id: 'verso_gluteos',
    label: 'Glúteos / Lombar (Verso)',
    baseRegion: 'gluteos',
    region: 'gluteos',
    view: 'back',
    side: 'midline',
    shapeType: 'polygon',
    points: '364,225 448,225 460,285 458,335 352,335 350,285',
    center: { x: 406, y: 280 }
  },
  {
    id: 'verso_perna_esquerda',
    label: 'Perna Esquerda (Verso)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '350,335 401,335 398,475 344,475',
    center: { x: 373, y: 405 }
  },
  {
    id: 'verso_perna_direita',
    label: 'Perna Direita (Verso)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '411,335 462,335 468,475 414,475',
    center: { x: 439, y: 405 }
  },
  {
    id: 'verso_canela_esquerda',
    label: 'Canela / Panturrilha Esquerda (Verso)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '344,475 398,475 391,625 336,625',
    center: { x: 367, y: 550 }
  },
  {
    id: 'verso_canela_direita',
    label: 'Canela / Panturrilha Direita (Verso)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '414,475 468,475 476,625 421,625',
    center: { x: 445, y: 550 }
  },
  {
    id: 'verso_pe_esquerdo',
    label: 'Pé Esquerdo (Verso)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'back',
    side: 'left',
    shapeType: 'polygon',
    points: '336,625 391,625 392,685 321,685',
    center: { x: 360, y: 655 }
  },
  {
    id: 'verso_pe_direito',
    label: 'Pé Direito (Verso)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'back',
    side: 'right',
    shapeType: 'polygon',
    points: '421,625 476,625 491,685 420,685',
    center: { x: 452, y: 655 }
  },

  // --- 3. PERFIL ESQUERDO ---
  {
    id: 'perfil_esq_cabeca',
    label: 'Cabeça (Perfil Esquerdo)',
    baseRegion: 'cabeca',
    region: 'cabeca',
    view: 'left',
    side: 'left',
    shapeType: 'ellipse',
    ellipseCoords: { cx: 646, cy: 65, rx: 34, ry: 42 },
    center: { x: 646, y: 65 }
  },
  {
    id: 'perfil_esq_ombro',
    label: 'Ombro (Perfil Esquerdo)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '625,120 670,120 680,160 635,160',
    center: { x: 652, y: 140 }
  },
  {
    id: 'perfil_esq_braco',
    label: 'Braço (Perfil Esquerdo)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '635,160 680,160 675,245 630,245',
    center: { x: 655, y: 202 }
  },
  {
    id: 'perfil_esq_antebraco',
    label: 'Antebraço (Perfil Esquerdo)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '630,245 675,245 670,325 625,325',
    center: { x: 650, y: 285 }
  },
  {
    id: 'perfil_esq_mao',
    label: 'Mão (Perfil Esquerdo)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '625,325 670,325 660,385 610,385',
    center: { x: 641, y: 355 }
  },
  {
    id: 'perfil_esq_torax',
    label: 'Tórax (Perfil Esquerdo)',
    baseRegion: 'torax',
    region: 'torax',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '605,145 655,145 660,220 607,220',
    center: { x: 632, y: 182 }
  },
  {
    id: 'perfil_esq_abdomen',
    label: 'Barriga / Abdômen (Perfil Esquerdo)',
    baseRegion: 'abdomen',
    region: 'abdomen',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '607,220 660,220 662,315 609,315',
    center: { x: 635, y: 267 }
  },
  {
    id: 'perfil_esq_gluteos',
    label: 'Glúteo (Perfil Esquerdo)',
    baseRegion: 'gluteos',
    region: 'gluteos',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '662,245 695,265 695,335 660,335',
    center: { x: 678, y: 290 }
  },
  {
    id: 'perfil_esq_perna',
    label: 'Perna (Perfil Esquerdo)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '615,335 685,335 682,475 620,475',
    center: { x: 651, y: 405 }
  },
  {
    id: 'perfil_esq_canela',
    label: 'Canela / Panturrilha (Perfil Esquerdo)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '620,475 682,475 678,630 626,630',
    center: { x: 651, y: 552 }
  },
  {
    id: 'perfil_esq_pe',
    label: 'Pé (Perfil Esquerdo)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'left',
    side: 'left',
    shapeType: 'polygon',
    points: '626,630 678,630 682,682 575,682',
    center: { x: 640, y: 656 }
  },

  // --- 4. PERFIL DIREITO ---
  {
    id: 'perfil_dir_cabeca',
    label: 'Cabeça (Perfil Direito)',
    baseRegion: 'cabeca',
    region: 'cabeca',
    view: 'right',
    side: 'right',
    shapeType: 'ellipse',
    ellipseCoords: { cx: 860, cy: 65, rx: 34, ry: 42 },
    center: { x: 860, y: 65 }
  },
  {
    id: 'perfil_dir_ombro',
    label: 'Ombro (Perfil Direito)',
    baseRegion: 'ombro',
    region: 'ombro',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '835,120 880,120 890,160 845,160',
    center: { x: 862, y: 140 }
  },
  {
    id: 'perfil_dir_braco',
    label: 'Braço (Perfil Direito)',
    baseRegion: 'braco',
    region: 'braco',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '845,160 890,160 885,245 840,245',
    center: { x: 865, y: 202 }
  },
  {
    id: 'perfil_dir_antebraco',
    label: 'Antebraço (Perfil Direito)',
    baseRegion: 'antebraco',
    region: 'antebraco',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '840,245 885,245 880,325 835,325',
    center: { x: 860, y: 285 }
  },
  {
    id: 'perfil_dir_mao',
    label: 'Mão (Perfil Direito)',
    baseRegion: 'mao',
    region: 'mao',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '835,325 880,325 870,385 820,385',
    center: { x: 851, y: 355 }
  },
  {
    id: 'perfil_dir_torax',
    label: 'Tórax (Perfil Direito)',
    baseRegion: 'torax',
    region: 'torax',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '820,145 870,145 875,220 822,220',
    center: { x: 847, y: 182 }
  },
  {
    id: 'perfil_dir_abdomen',
    label: 'Barriga / Abdômen (Perfil Direito)',
    baseRegion: 'abdomen',
    region: 'abdomen',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '822,220 875,220 877,315 824,315',
    center: { x: 849, y: 267 }
  },
  {
    id: 'perfil_dir_gluteos',
    label: 'Glúteo (Perfil Direito)',
    baseRegion: 'gluteos',
    region: 'gluteos',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '788,245 822,265 822,335 788,335',
    center: { x: 805, y: 290 }
  },
  {
    id: 'perfil_dir_perna',
    label: 'Perna (Perfil Direito)',
    baseRegion: 'perna',
    region: 'perna',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '830,335 900,335 897,475 834,475',
    center: { x: 865, y: 405 }
  },
  {
    id: 'perfil_dir_canela',
    label: 'Canela / Panturrilha (Perfil Direito)',
    baseRegion: 'canela',
    region: 'canela',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '834,475 897,475 893,630 841,630',
    center: { x: 866, y: 552 }
  },
  {
    id: 'perfil_dir_pe',
    label: 'Pé (Perfil Direito)',
    baseRegion: 'pe',
    region: 'pe',
    view: 'right',
    side: 'right',
    shapeType: 'polygon',
    points: '841,630 893,630 935,682 830,682',
    center: { x: 875, y: 656 }
  }
];

// Dicionário por modelo corporal
export function getPanoramaRegions(model: 'female' | 'male'): BodyPanoramaRegion[] {
  return model === 'female' ? PANORAMA_REGIONS_FEMALE : PANORAMA_REGIONS_MALE;
}

// Obter label amigável pelo ID
export function getRegionLabel(regionId: string, model: 'female' | 'male' = 'male'): string {
  const list = getPanoramaRegions(model);
  const found = list.find(r => r.id === regionId);
  if (found) return found.label;

  // Fallback se não encontrar
  const parts = regionId.split('_');
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
