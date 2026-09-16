export interface BodyRegionDef {
  id: string;
  region: string;
  side: 'right' | 'left' | 'midline';
  view: 'front' | 'back' | 'left' | 'right';
  label: string;
  category: 'head_neck' | 'trunk_anterior' | 'trunk_posterior' | 'upper_limbs' | 'lower_limbs';
  // Coordenadas no grid 1000x1000
  // Frente: 0..250 | Verso: 250..500 | Lado Esquerdo: 500..750 | Lado Direito: 750..1000
  shapeType: 'ellipse' | 'rect';
  coords: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    cx?: number;
    cy?: number;
    rx?: number;
    ry?: number;
    rxRadius?: number; // border radius for rect
    transform?: string;
  };
  center: { x: number; y: number }; // Coordenada central no grid 1000x1000
}

export const BODY_REGIONS: BodyRegionDef[] = [
  // =========================================================================
  // 1. FRENTE (X: 0 a 250)
  // Paciente de frente: lado DIREITO anatômico fica à ESQUERDA do observador (x: 0..125)
  // lado ESQUERDO anatômico fica à DIREITA do observador (x: 125..250)
  // =========================================================================

  // Cabeça e Pescoço
  {
    id: 'front-cabeca',
    region: 'cabeça',
    side: 'midline',
    view: 'front',
    label: 'Cabeça (Frente)',
    category: 'head_neck',
    shapeType: 'ellipse',
    coords: { cx: 125, cy: 85, rx: 34, ry: 46 },
    center: { x: 125, y: 85 }
  },
  {
    id: 'front-cervical',
    region: 'cervical',
    side: 'midline',
    view: 'front',
    label: 'Cervical / Pescoço Anterior',
    category: 'head_neck',
    shapeType: 'rect',
    coords: { x: 110, y: 135, width: 30, height: 28, rxRadius: 6 },
    center: { x: 125, y: 149 }
  },

  // Tronco Anterior
  {
    id: 'front-torax',
    region: 'tórax',
    side: 'midline',
    view: 'front',
    label: 'Tórax / Peitoral',
    category: 'trunk_anterior',
    shapeType: 'rect',
    coords: { x: 85, y: 165, width: 80, height: 85, rxRadius: 10 },
    center: { x: 125, y: 207 }
  },
  {
    id: 'front-abdomen',
    region: 'abdômen',
    side: 'midline',
    view: 'front',
    label: 'Abdômen',
    category: 'trunk_anterior',
    shapeType: 'rect',
    coords: { x: 88, y: 252, width: 74, height: 75, rxRadius: 8 },
    center: { x: 125, y: 289 }
  },
  {
    id: 'front-pelve',
    region: 'pelve',
    side: 'midline',
    view: 'front',
    label: 'Pelve / Púbis',
    category: 'trunk_anterior',
    shapeType: 'rect',
    coords: { x: 92, y: 330, width: 66, height: 46, rxRadius: 8 },
    center: { x: 125, y: 353 }
  },
  {
    id: 'front-quadril-dir',
    region: 'quadril',
    side: 'right',
    view: 'front',
    label: 'Quadril Direito',
    category: 'trunk_anterior',
    shapeType: 'rect',
    coords: { x: 62, y: 326, width: 32, height: 52, rxRadius: 10 },
    center: { x: 78, y: 352 }
  },
  {
    id: 'front-quadril-esq',
    region: 'quadril',
    side: 'left',
    view: 'front',
    label: 'Quadril Esquerdo',
    category: 'trunk_anterior',
    shapeType: 'rect',
    coords: { x: 156, y: 326, width: 32, height: 52, rxRadius: 10 },
    center: { x: 172, y: 352 }
  },

  // Membros Superiores - Direito (à esquerda da tela)
  {
    id: 'front-ombro-dir',
    region: 'ombro',
    side: 'right',
    view: 'front',
    label: 'Ombro Direito',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 45, y: 165, width: 38, height: 35, rxRadius: 8 },
    center: { x: 64, y: 182 }
  },
  {
    id: 'front-braco-dir',
    region: 'braço',
    side: 'right',
    view: 'front',
    label: 'Braço Direito',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 34, y: 202, width: 32, height: 64, rxRadius: 10 },
    center: { x: 50, y: 234 }
  },
  {
    id: 'front-cotovelo-dir',
    region: 'cotovelo',
    side: 'right',
    view: 'front',
    label: 'Cotovelo Direito',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 28, y: 268, width: 30, height: 30, rxRadius: 8 },
    center: { x: 43, y: 283 }
  },
  {
    id: 'front-antebraco-dir',
    region: 'antebraço',
    side: 'right',
    view: 'front',
    label: 'Antebraço Direito',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 20, y: 300, width: 30, height: 60, rxRadius: 8 },
    center: { x: 35, y: 330 }
  },
  {
    id: 'front-punho-dir',
    region: 'punho',
    side: 'right',
    view: 'front',
    label: 'Punho Direito',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 15, y: 362, width: 26, height: 22, rxRadius: 6 },
    center: { x: 28, y: 373 }
  },
  {
    id: 'front-mao-dir',
    region: 'mão',
    side: 'right',
    view: 'front',
    label: 'Mão Direita',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 8, y: 385, width: 28, height: 45, rxRadius: 8 },
    center: { x: 22, y: 407 }
  },

  // Membros Superiores - Esquerdo (à direita da tela)
  {
    id: 'front-ombro-esq',
    region: 'ombro',
    side: 'left',
    view: 'front',
    label: 'Ombro Esquerdo',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 167, y: 165, width: 38, height: 35, rxRadius: 8 },
    center: { x: 186, y: 182 }
  },
  {
    id: 'front-braco-esq',
    region: 'braço',
    side: 'left',
    view: 'front',
    label: 'Braço Esquerdo',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 184, y: 202, width: 32, height: 64, rxRadius: 10 },
    center: { x: 200, y: 234 }
  },
  {
    id: 'front-cotovelo-esq',
    region: 'cotovelo',
    side: 'left',
    view: 'front',
    label: 'Cotovelo Esquerdo',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 192, y: 268, width: 30, height: 30, rxRadius: 8 },
    center: { x: 207, y: 283 }
  },
  {
    id: 'front-antebraco-esq',
    region: 'antebraço',
    side: 'left',
    view: 'front',
    label: 'Antebraço Esquerdo',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 200, y: 300, width: 30, height: 60, rxRadius: 8 },
    center: { x: 215, y: 330 }
  },
  {
    id: 'front-punho-esq',
    region: 'punho',
    side: 'left',
    view: 'front',
    label: 'Punho Esquerdo',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 209, y: 362, width: 26, height: 22, rxRadius: 6 },
    center: { x: 222, y: 373 }
  },
  {
    id: 'front-mao-esq',
    region: 'mão',
    side: 'left',
    view: 'front',
    label: 'Mão Esquerda',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 214, y: 385, width: 28, height: 45, rxRadius: 8 },
    center: { x: 228, y: 407 }
  },

  // Membros Inferiores - Direito
  {
    id: 'front-coxa-dir',
    region: 'coxa',
    side: 'right',
    view: 'front',
    label: 'Coxa Direita',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 80, y: 380, width: 44, height: 125, rxRadius: 14 },
    center: { x: 102, y: 442 }
  },
  {
    id: 'front-joelho-dir',
    region: 'joelho',
    side: 'right',
    view: 'front',
    label: 'Joelho Direito',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 84, y: 508, width: 40, height: 46, rxRadius: 10 },
    center: { x: 104, y: 531 }
  },
  {
    id: 'front-perna-dir',
    region: 'perna',
    side: 'right',
    view: 'front',
    label: 'Perna Direita',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 82, y: 556, width: 38, height: 115, rxRadius: 10 },
    center: { x: 101, y: 613 }
  },
  {
    id: 'front-tornozelo-dir',
    region: 'tornozelo',
    side: 'right',
    view: 'front',
    label: 'Tornozelo Direito',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 82, y: 673, width: 34, height: 26, rxRadius: 6 },
    center: { x: 99, y: 686 }
  },
  {
    id: 'front-pe-dir',
    region: 'pé',
    side: 'right',
    view: 'front',
    label: 'Pé Direito',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 70, y: 700, width: 46, height: 26, rxRadius: 8 },
    center: { x: 93, y: 713 }
  },

  // Membros Inferiores - Esquerdo
  {
    id: 'front-coxa-esq',
    region: 'coxa',
    side: 'left',
    view: 'front',
    label: 'Coxa Esquerda',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 126, y: 380, width: 44, height: 125, rxRadius: 14 },
    center: { x: 148, y: 442 }
  },
  {
    id: 'front-joelho-esq',
    region: 'joelho',
    side: 'left',
    view: 'front',
    label: 'Joelho Esquerdo',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 126, y: 508, width: 40, height: 46, rxRadius: 10 },
    center: { x: 146, y: 531 }
  },
  {
    id: 'front-perna-esq',
    region: 'perna',
    side: 'left',
    view: 'front',
    label: 'Perna Esquerda',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 130, y: 556, width: 38, height: 115, rxRadius: 10 },
    center: { x: 149, y: 613 }
  },
  {
    id: 'front-tornozelo-esq',
    region: 'tornozelo',
    side: 'left',
    view: 'front',
    label: 'Tornozelo Esquerdo',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 134, y: 673, width: 34, height: 26, rxRadius: 6 },
    center: { x: 151, y: 686 }
  },
  {
    id: 'front-pe-esq',
    region: 'pé',
    side: 'left',
    view: 'front',
    label: 'Pé Esquerdo',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 134, y: 700, width: 46, height: 26, rxRadius: 8 },
    center: { x: 157, y: 713 }
  },

  // =========================================================================
  // 2. VERSO (X: 250 a 500)
  // Paciente de costas: lado ESQUERDO fica à ESQUERDA do observador (x: 250..375)
  // lado DIREITO fica à DIREITA do observador (x: 375..500)
  // =========================================================================

  // Cabeça e Pescoço Posterior
  {
    id: 'back-cabeca',
    region: 'cabeça',
    side: 'midline',
    view: 'back',
    label: 'Cabeça (Posterior / Occipital)',
    category: 'head_neck',
    shapeType: 'ellipse',
    coords: { cx: 375, cy: 85, rx: 34, ry: 46 },
    center: { x: 375, y: 85 }
  },
  {
    id: 'back-cervical',
    region: 'cervical',
    side: 'midline',
    view: 'back',
    label: 'Região Cervical Posterior',
    category: 'head_neck',
    shapeType: 'rect',
    coords: { x: 360, y: 135, width: 30, height: 32, rxRadius: 6 },
    center: { x: 375, y: 151 }
  },

  // Tronco Posterior
  {
    id: 'back-toracica',
    region: 'região torácica',
    side: 'midline',
    view: 'back',
    label: 'Coluna / Região Torácica',
    category: 'trunk_posterior',
    shapeType: 'rect',
    coords: { x: 345, y: 170, width: 60, height: 90, rxRadius: 8 },
    center: { x: 375, y: 215 }
  },
  {
    id: 'back-escapula-esq',
    region: 'escápula',
    side: 'left',
    view: 'back',
    label: 'Escápula Esquerda',
    category: 'trunk_posterior',
    shapeType: 'rect',
    coords: { x: 305, y: 172, width: 38, height: 58, rxRadius: 10 },
    center: { x: 324, y: 201 }
  },
  {
    id: 'back-escapula-dir',
    region: 'escápula',
    side: 'right',
    view: 'back',
    label: 'Escápula Direita',
    category: 'trunk_posterior',
    shapeType: 'rect',
    coords: { x: 407, y: 172, width: 38, height: 58, rxRadius: 10 },
    center: { x: 426, y: 201 }
  },
  {
    id: 'back-lombar',
    region: 'região lombar',
    side: 'midline',
    view: 'back',
    label: 'Região Lombar',
    category: 'trunk_posterior',
    shapeType: 'rect',
    coords: { x: 340, y: 262, width: 70, height: 65, rxRadius: 8 },
    center: { x: 375, y: 294 }
  },
  {
    id: 'back-gluteo-esq',
    region: 'glúteo',
    side: 'left',
    view: 'back',
    label: 'Glúteo Esquerdo',
    category: 'trunk_posterior',
    shapeType: 'rect',
    coords: { x: 318, y: 328, width: 54, height: 64, rxRadius: 12 },
    center: { x: 345, y: 360 }
  },
  {
    id: 'back-gluteo-dir',
    region: 'glúteo',
    side: 'right',
    view: 'back',
    label: 'Glúteo Direito',
    category: 'trunk_posterior',
    shapeType: 'rect',
    coords: { x: 378, y: 328, width: 54, height: 64, rxRadius: 12 },
    center: { x: 405, y: 360 }
  },

  // Membros Superiores Posteriores - Esquerdo
  {
    id: 'back-ombro-esq',
    region: 'ombro',
    side: 'left',
    view: 'back',
    label: 'Ombro Esquerdo (Dorso)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 295, y: 165, width: 38, height: 35, rxRadius: 8 },
    center: { x: 314, y: 182 }
  },
  {
    id: 'back-braco-esq',
    region: 'braço',
    side: 'left',
    view: 'back',
    label: 'Braço Esquerdo (Posterior)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 282, y: 202, width: 32, height: 64, rxRadius: 10 },
    center: { x: 298, y: 234 }
  },
  {
    id: 'back-cotovelo-esq',
    region: 'cotovelo',
    side: 'left',
    view: 'back',
    label: 'Cotovelo Esquerdo (Posterior)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 274, y: 268, width: 30, height: 30, rxRadius: 8 },
    center: { x: 289, y: 283 }
  },
  {
    id: 'back-antebraco-esq',
    region: 'antebraço',
    side: 'left',
    view: 'back',
    label: 'Antebraço Esquerdo (Posterior)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 264, y: 300, width: 30, height: 60, rxRadius: 8 },
    center: { x: 279, y: 330 }
  },
  {
    id: 'back-punho-esq',
    region: 'punho',
    side: 'left',
    view: 'back',
    label: 'Punho Esquerdo (Posterior)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 256, y: 362, width: 26, height: 22, rxRadius: 6 },
    center: { x: 269, y: 373 }
  },
  {
    id: 'back-mao-esq',
    region: 'mão',
    side: 'left',
    view: 'back',
    label: 'Mão Esquerda (Dorso)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 248, y: 385, width: 28, height: 45, rxRadius: 8 },
    center: { x: 262, y: 407 }
  },

  // Membros Superiores Posteriores - Direito
  {
    id: 'back-ombro-dir',
    region: 'ombro',
    side: 'right',
    view: 'back',
    label: 'Ombro Direito (Dorso)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 418, y: 165, width: 38, height: 35, rxRadius: 8 },
    center: { x: 437, y: 182 }
  },
  {
    id: 'back-braco-dir',
    region: 'braço',
    side: 'right',
    view: 'back',
    label: 'Braço Direito (Posterior)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 436, y: 202, width: 32, height: 64, rxRadius: 10 },
    center: { x: 452, y: 234 }
  },
  {
    id: 'back-cotovelo-dir',
    region: 'cotovelo',
    side: 'right',
    view: 'back',
    label: 'Cotovelo Direito (Posterior)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 444, y: 268, width: 30, height: 30, rxRadius: 8 },
    center: { x: 459, y: 283 }
  },
  {
    id: 'back-antebraco-dir',
    region: 'antebraço',
    side: 'right',
    view: 'back',
    label: 'Antebraço Direito (Posterior)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 454, y: 300, width: 30, height: 60, rxRadius: 8 },
    center: { x: 469, y: 330 }
  },
  {
    id: 'back-punho-dir',
    region: 'punho',
    side: 'right',
    view: 'back',
    label: 'Punho Direito (Posterior)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 466, y: 362, width: 26, height: 22, rxRadius: 6 },
    center: { x: 479, y: 373 }
  },
  {
    id: 'back-mao-dir',
    region: 'mão',
    side: 'right',
    view: 'back',
    label: 'Mão Direita (Dorso)',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 472, y: 385, width: 28, height: 45, rxRadius: 8 },
    center: { x: 486, y: 407 }
  },

  // Membros Inferiores Posteriores - Esquerdo
  {
    id: 'back-coxa-esq',
    region: 'coxa',
    side: 'left',
    view: 'back',
    label: 'Coxa Esquerda / Isquiotibiais',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 326, y: 394, width: 46, height: 125, rxRadius: 14 },
    center: { x: 349, y: 456 }
  },
  {
    id: 'back-joelho-esq',
    region: 'joelho',
    side: 'left',
    view: 'back',
    label: 'Joelho Esquerdo / Fossa Poplítea',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 328, y: 520, width: 42, height: 36, rxRadius: 8 },
    center: { x: 349, y: 538 }
  },
  {
    id: 'back-panturrilha-esq',
    region: 'panturrilha',
    side: 'left',
    view: 'back',
    label: 'Panturrilha Esquerda',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 324, y: 558, width: 44, height: 114, rxRadius: 10 },
    center: { x: 346, y: 615 }
  },
  {
    id: 'back-tornozelo-esq',
    region: 'tornozelo',
    side: 'left',
    view: 'back',
    label: 'Tornozelo / Tendão de Aquiles Esquerdo',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 332, y: 673, width: 32, height: 26, rxRadius: 6 },
    center: { x: 348, y: 686 }
  },
  {
    id: 'back-pe-esq',
    region: 'pé',
    side: 'left',
    view: 'back',
    label: 'Calcanhar / Planta do Pé Esquerdo',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 328, y: 700, width: 38, height: 26, rxRadius: 8 },
    center: { x: 347, y: 713 }
  },

  // Membros Inferiores Posteriores - Direito
  {
    id: 'back-coxa-dir',
    region: 'coxa',
    side: 'right',
    view: 'back',
    label: 'Coxa Direita / Isquiotibiais',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 378, y: 394, width: 46, height: 125, rxRadius: 14 },
    center: { x: 401, y: 456 }
  },
  {
    id: 'back-joelho-dir',
    region: 'joelho',
    side: 'right',
    view: 'back',
    label: 'Joelho Direito / Fossa Poplítea',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 380, y: 520, width: 42, height: 36, rxRadius: 8 },
    center: { x: 401, y: 538 }
  },
  {
    id: 'back-panturrilha-dir',
    region: 'panturrilha',
    side: 'right',
    view: 'back',
    label: 'Panturrilha Direita',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 382, y: 558, width: 44, height: 114, rxRadius: 10 },
    center: { x: 404, y: 615 }
  },
  {
    id: 'back-tornozelo-dir',
    region: 'tornozelo',
    side: 'right',
    view: 'back',
    label: 'Tornozelo / Tendão de Aquiles Direito',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 386, y: 673, width: 32, height: 26, rxRadius: 6 },
    center: { x: 402, y: 686 }
  },
  {
    id: 'back-pe-dir',
    region: 'pé',
    side: 'right',
    view: 'back',
    label: 'Calcanhar / Planta do Pé Direito',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 384, y: 700, width: 38, height: 26, rxRadius: 8 },
    center: { x: 403, y: 713 }
  },

  // =========================================================================
  // 3. LADO ESQUERDO (X: 500 a 750)
  // Perfil esquerdo do corpo
  // =========================================================================
  {
    id: 'left-cabeca',
    region: 'cabeça',
    side: 'left',
    view: 'left',
    label: 'Cabeça (Perfil Esquerdo)',
    category: 'head_neck',
    shapeType: 'ellipse',
    coords: { cx: 636, cy: 85, rx: 32, ry: 46 },
    center: { x: 636, y: 85 }
  },
  {
    id: 'left-cervical',
    region: 'cervical',
    side: 'left',
    view: 'left',
    label: 'Cervical Lateral Esquerda',
    category: 'head_neck',
    shapeType: 'rect',
    coords: { x: 624, y: 135, width: 30, height: 32, rxRadius: 6 },
    center: { x: 639, y: 151 }
  },
  {
    id: 'left-tronco',
    region: 'tórax',
    side: 'left',
    view: 'left',
    label: 'Tronco / Flanco Esquerdo',
    category: 'trunk_anterior',
    shapeType: 'rect',
    coords: { x: 605, y: 170, width: 56, height: 150, rxRadius: 12 },
    center: { x: 633, y: 245 }
  },
  {
    id: 'left-braco',
    region: 'braço',
    side: 'left',
    view: 'left',
    label: 'Braço Lateral Esquerdo',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 615, y: 190, width: 38, height: 215, rxRadius: 14 },
    center: { x: 634, y: 297 }
  },
  {
    id: 'left-quadril',
    region: 'quadril',
    side: 'left',
    view: 'left',
    label: 'Quadril / Glúteo Lateral Esquerdo',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 600, y: 322, width: 58, height: 75, rxRadius: 14 },
    center: { x: 629, y: 359 }
  },
  {
    id: 'left-coxa',
    region: 'coxa',
    side: 'left',
    view: 'left',
    label: 'Coxa Lateral Esquerda',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 604, y: 398, width: 56, height: 125, rxRadius: 14 },
    center: { x: 632, y: 460 }
  },
  {
    id: 'left-joelho',
    region: 'joelho',
    side: 'left',
    view: 'left',
    label: 'Joelho Lateral Esquerdo',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 610, y: 524, width: 48, height: 42, rxRadius: 10 },
    center: { x: 634, y: 545 }
  },
  {
    id: 'left-perna',
    region: 'perna',
    side: 'left',
    view: 'left',
    label: 'Perna Lateral Esquerda',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 612, y: 568, width: 44, height: 114, rxRadius: 10 },
    center: { x: 634, y: 625 }
  },
  {
    id: 'left-tornozelo',
    region: 'tornozelo',
    side: 'left',
    view: 'left',
    label: 'Tornozelo Lateral Esquerdo',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 618, y: 682, width: 38, height: 24, rxRadius: 6 },
    center: { x: 637, y: 694 }
  },
  {
    id: 'left-pe',
    region: 'pé',
    side: 'left',
    view: 'left',
    label: 'Pé Lateral Esquerdo',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 594, y: 706, width: 68, height: 24, rxRadius: 8 },
    center: { x: 628, y: 718 }
  },

  // =========================================================================
  // 4. LADO DIREITO (X: 750 a 1000)
  // Perfil direito do corpo
  // =========================================================================
  {
    id: 'right-cabeca',
    region: 'cabeça',
    side: 'right',
    view: 'right',
    label: 'Cabeça (Perfil Direito)',
    category: 'head_neck',
    shapeType: 'ellipse',
    coords: { cx: 886, cy: 85, rx: 32, ry: 46 },
    center: { x: 886, y: 85 }
  },
  {
    id: 'right-cervical',
    region: 'cervical',
    side: 'right',
    view: 'right',
    label: 'Cervical Lateral Direita',
    category: 'head_neck',
    shapeType: 'rect',
    coords: { x: 874, y: 135, width: 30, height: 32, rxRadius: 6 },
    center: { x: 889, y: 151 }
  },
  {
    id: 'right-tronco',
    region: 'tórax',
    side: 'right',
    view: 'right',
    label: 'Tronco / Flanco Direito',
    category: 'trunk_anterior',
    shapeType: 'rect',
    coords: { x: 865, y: 170, width: 56, height: 150, rxRadius: 12 },
    center: { x: 893, y: 245 }
  },
  {
    id: 'right-braco',
    region: 'braço',
    side: 'right',
    view: 'right',
    label: 'Braço Lateral Direito',
    category: 'upper_limbs',
    shapeType: 'rect',
    coords: { x: 872, y: 190, width: 38, height: 215, rxRadius: 14 },
    center: { x: 891, y: 297 }
  },
  {
    id: 'right-quadril',
    region: 'quadril',
    side: 'right',
    view: 'right',
    label: 'Quadril / Glúteo Lateral Direito',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 866, y: 322, width: 58, height: 75, rxRadius: 14 },
    center: { x: 895, y: 359 }
  },
  {
    id: 'right-coxa',
    region: 'coxa',
    side: 'right',
    view: 'right',
    label: 'Coxa Lateral Direita',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 866, y: 398, width: 56, height: 125, rxRadius: 14 },
    center: { x: 894, y: 460 }
  },
  {
    id: 'right-joelho',
    region: 'joelho',
    side: 'right',
    view: 'right',
    label: 'Joelho Lateral Direito',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 870, y: 524, width: 48, height: 42, rxRadius: 10 },
    center: { x: 894, y: 545 }
  },
  {
    id: 'right-perna',
    region: 'perna',
    side: 'right',
    view: 'right',
    label: 'Perna Lateral Direita',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 870, y: 568, width: 44, height: 114, rxRadius: 10 },
    center: { x: 892, y: 625 }
  },
  {
    id: 'right-tornozelo',
    region: 'tornozelo',
    side: 'right',
    view: 'right',
    label: 'Tornozelo Lateral Direito',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 872, y: 682, width: 38, height: 24, rxRadius: 6 },
    center: { x: 891, y: 694 }
  },
  {
    id: 'right-pe',
    region: 'pé',
    side: 'right',
    view: 'right',
    label: 'Pé Lateral Direito',
    category: 'lower_limbs',
    shapeType: 'rect',
    coords: { x: 868, y: 706, width: 68, height: 24, rxRadius: 8 },
    center: { x: 902, y: 718 }
  }
];

export const VIEW_BOUNDS: Record<'front' | 'back' | 'left' | 'right', { minX: number; maxX: number; width: number }> = {
  front: { minX: 0, maxX: 250, width: 250 },
  back: { minX: 250, maxX: 500, width: 250 },
  left: { minX: 500, maxX: 750, width: 250 },
  right: { minX: 750, maxX: 1000, width: 250 }
};

export const VIEW_INDEX: Record<'front' | 'back' | 'left' | 'right', number> = {
  front: 0,
  back: 1,
  left: 2,
  right: 3
};
