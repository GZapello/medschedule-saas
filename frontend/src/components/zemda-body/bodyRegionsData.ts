export interface BodyRegionDef {
  id: string;
  region: string; // cabeça, ombro, braço, antebraço, mão, tórax, barriga, glúteo, perna, canela, pé
  side: 'right' | 'left' | 'midline';
  view: 'front' | 'back' | 'left' | 'right';
  label: string;
  shapeType: 'polygon' | 'ellipse';
  points?: string; // Para polygon "x1,y1 x2,y2 ..."
  ellipseCoords?: { cx: number; cy: number; rx: number; ry: number };
  center: { x: number; y: number }; // Coordenada central no espaço 400x760 da vista
}

export const VIEW_CANVAS_DIMS = {
  single: { width: 400, height: 760 },
  panorama: { width: 1024, height: 768 }
};

// Conversor linear preciso de coordenadas da vista individual (400x760) para o panorama (1024x768)
export function mapToPanorama(x: number, y: number, view: 'front' | 'back' | 'left' | 'right'): { x: number; y: number } {
  const centers = {
    front: 150,
    back: 435,
    left: 665,
    right: 870
  };
  const panoX = x - 200 + centers[view];
  const panoY = y - 20;
  return { x: Math.max(0, Math.min(1024, panoX)), y: Math.max(0, Math.min(768, panoY)) };
}

// Converte string de points do polígono para o grid do panorama
export function mapPointsToPanorama(pointsStr: string, view: 'front' | 'back' | 'left' | 'right'): string {
  return pointsStr
    .trim()
    .split(/\s+/)
    .map(pair => {
      const [px, py] = pair.split(',').map(Number);
      const mapped = mapToPanorama(px, py, view);
      return `${mapped.x.toFixed(1)},${mapped.y.toFixed(1)}`;
    })
    .join(' ');
}

export const BODY_REGIONS: BodyRegionDef[] = [
  // =========================================================================
  // 1. FRENTE (view: 'front', espaço 400 x 760)
  // Lateralidade do paciente:
  // Lado DIREITO do paciente = tela ESQUERDA (x < 200, side: 'right')
  // Lado ESQUERDO do paciente = tela DIREITA (x > 200, side: 'left')
  // =========================================================================

  // 1. Cabeça
  {
    id: 'front-cabeca',
    region: 'cabeça',
    side: 'midline',
    view: 'front',
    label: 'Cabeça',
    shapeType: 'ellipse',
    ellipseCoords: { cx: 200, cy: 75, rx: 38, ry: 48 },
    center: { x: 200, y: 75 }
  },

  // 2. Ombros
  {
    id: 'front-ombro-dir',
    region: 'ombro',
    side: 'right',
    view: 'front',
    label: 'Ombro Direito',
    shapeType: 'polygon',
    points: '172,130 120,150 115,185 145,185 168,150 178,135',
    center: { x: 140, y: 155 }
  },
  {
    id: 'front-ombro-esq',
    region: 'ombro',
    side: 'left',
    view: 'front',
    label: 'Ombro Esquerdo',
    shapeType: 'polygon',
    points: '228,130 280,150 285,185 255,185 232,150 222,135',
    center: { x: 260, y: 155 }
  },

  // 3. Braços
  {
    id: 'front-braco-dir',
    region: 'braço',
    side: 'right',
    view: 'front',
    label: 'Braço Direito',
    shapeType: 'polygon',
    points: '115,185 145,185 138,265 100,265',
    center: { x: 122, y: 225 }
  },
  {
    id: 'front-braco-esq',
    region: 'braço',
    side: 'left',
    view: 'front',
    label: 'Braço Esquerdo',
    shapeType: 'polygon',
    points: '255,185 285,185 300,265 262,265',
    center: { x: 278, y: 225 }
  },

  // 4. Antebraços
  {
    id: 'front-antebraco-dir',
    region: 'antebraço',
    side: 'right',
    view: 'front',
    label: 'Antebraço Direito',
    shapeType: 'polygon',
    points: '100,265 138,265 125,365 85,365',
    center: { x: 110, y: 315 }
  },
  {
    id: 'front-antebraco-esq',
    region: 'antebraço',
    side: 'left',
    view: 'front',
    label: 'Antebraço Esquerdo',
    shapeType: 'polygon',
    points: '262,265 300,265 315,365 275,365',
    center: { x: 290, y: 315 }
  },

  // 5. Mãos
  {
    id: 'front-mao-dir',
    region: 'mão',
    side: 'right',
    view: 'front',
    label: 'Mão Direita',
    shapeType: 'polygon',
    points: '85,365 125,365 115,445 68,445',
    center: { x: 95, y: 405 }
  },
  {
    id: 'front-mao-esq',
    region: 'mão',
    side: 'left',
    view: 'front',
    label: 'Mão Esquerda',
    shapeType: 'polygon',
    points: '275,365 315,365 332,445 285,445',
    center: { x: 305, y: 405 }
  },

  // 6. Tórax
  {
    id: 'front-torax',
    region: 'tórax',
    side: 'midline',
    view: 'front',
    label: 'Tórax',
    shapeType: 'polygon',
    points: '175,130 225,130 248,150 245,225 155,225 152,150',
    center: { x: 200, y: 180 }
  },

  // 7. Barriga / Abdômen
  {
    id: 'front-barriga',
    region: 'barriga',
    side: 'midline',
    view: 'front',
    label: 'Barriga / Abdômen',
    shapeType: 'polygon',
    points: '155,225 245,225 240,335 160,335',
    center: { x: 200, y: 275 }
  },

  // 8. Pernas (Coxas)
  {
    id: 'front-perna-dir',
    region: 'perna',
    side: 'right',
    view: 'front',
    label: 'Perna Direita (Coxa)',
    shapeType: 'polygon',
    points: '150,335 200,335 192,510 148,510',
    center: { x: 172, y: 420 }
  },
  {
    id: 'front-perna-esq',
    region: 'perna',
    side: 'left',
    view: 'front',
    label: 'Perna Esquerda (Coxa)',
    shapeType: 'polygon',
    points: '200,335 250,335 252,510 208,510',
    center: { x: 228, y: 420 }
  },

  // 9. Canelas
  {
    id: 'front-canela-dir',
    region: 'canela',
    side: 'right',
    view: 'front',
    label: 'Canela Direita',
    shapeType: 'polygon',
    points: '148,510 192,510 188,645 152,645',
    center: { x: 170, y: 575 }
  },
  {
    id: 'front-canela-esq',
    region: 'canela',
    side: 'left',
    view: 'front',
    label: 'Canela Esquerda',
    shapeType: 'polygon',
    points: '208,510 252,510 248,645 212,645',
    center: { x: 230, y: 575 }
  },

  // 10. Pés
  {
    id: 'front-pe-dir',
    region: 'pé',
    side: 'right',
    view: 'front',
    label: 'Pé Direito',
    shapeType: 'polygon',
    points: '152,645 188,645 190,705 138,705',
    center: { x: 165, y: 675 }
  },
  {
    id: 'front-pe-esq',
    region: 'pé',
    side: 'left',
    view: 'front',
    label: 'Pé Esquerdo',
    shapeType: 'polygon',
    points: '212,645 248,645 262,705 210,705',
    center: { x: 235, y: 675 }
  },

  // =========================================================================
  // 2. VERSO (view: 'back', espaço 400 x 760)
  // Lateralidade do paciente:
  // Lado ESQUERDO do paciente = tela ESQUERDA (x < 200, side: 'left')
  // Lado DIREITO do paciente = tela DIREITA (x > 200, side: 'right')
  // =========================================================================

  // 1. Cabeça
  {
    id: 'back-cabeca',
    region: 'cabeça',
    side: 'midline',
    view: 'back',
    label: 'Cabeça Posterior',
    shapeType: 'ellipse',
    ellipseCoords: { cx: 200, cy: 75, rx: 38, ry: 48 },
    center: { x: 200, y: 75 }
  },

  // 2. Ombros
  {
    id: 'back-ombro-esq',
    region: 'ombro',
    side: 'left',
    view: 'back',
    label: 'Ombro Esquerdo',
    shapeType: 'polygon',
    points: '172,130 120,150 115,185 145,185 168,150 178,135',
    center: { x: 140, y: 155 }
  },
  {
    id: 'back-ombro-dir',
    region: 'ombro',
    side: 'right',
    view: 'back',
    label: 'Ombro Direito',
    shapeType: 'polygon',
    points: '228,130 280,150 285,185 255,185 232,150 222,135',
    center: { x: 260, y: 155 }
  },

  // 3. Braços
  {
    id: 'back-braco-esq',
    region: 'braço',
    side: 'left',
    view: 'back',
    label: 'Braço Esquerdo',
    shapeType: 'polygon',
    points: '115,185 145,185 138,265 100,265',
    center: { x: 122, y: 225 }
  },
  {
    id: 'back-braco-dir',
    region: 'braço',
    side: 'right',
    view: 'back',
    label: 'Braço Direito',
    shapeType: 'polygon',
    points: '255,185 285,185 300,265 262,265',
    center: { x: 278, y: 225 }
  },

  // 4. Antebraços
  {
    id: 'back-antebraco-esq',
    region: 'antebraço',
    side: 'left',
    view: 'back',
    label: 'Antebraço Esquerdo',
    shapeType: 'polygon',
    points: '100,265 138,265 125,365 85,365',
    center: { x: 110, y: 315 }
  },
  {
    id: 'back-antebraco-dir',
    region: 'antebraço',
    side: 'right',
    view: 'back',
    label: 'Antebraço Direito',
    shapeType: 'polygon',
    points: '262,265 300,265 315,365 275,365',
    center: { x: 290, y: 315 }
  },

  // 5. Mãos
  {
    id: 'back-mao-esq',
    region: 'mão',
    side: 'left',
    view: 'back',
    label: 'Mão Esquerda',
    shapeType: 'polygon',
    points: '85,365 125,365 115,445 68,445',
    center: { x: 95, y: 405 }
  },
  {
    id: 'back-mao-dir',
    region: 'mão',
    side: 'right',
    view: 'back',
    label: 'Mão Direita',
    shapeType: 'polygon',
    points: '275,365 315,365 332,445 285,445',
    center: { x: 305, y: 405 }
  },

  // 6. Tórax Posterior (Costas)
  {
    id: 'back-torax',
    region: 'tórax',
    side: 'midline',
    view: 'back',
    label: 'Tórax Posterior (Costas)',
    shapeType: 'polygon',
    points: '175,130 225,130 248,150 245,230 155,230 152,150',
    center: { x: 200, y: 185 }
  },

  // 7. Barriga / Região Lombar
  {
    id: 'back-barriga',
    region: 'barriga',
    side: 'midline',
    view: 'back',
    label: 'Lombar',
    shapeType: 'polygon',
    points: '158,230 242,230 238,300 162,300',
    center: { x: 200, y: 265 }
  },

  // 8. Glúteos
  {
    id: 'back-gluteo-esq',
    region: 'glúteo',
    side: 'left',
    view: 'back',
    label: 'Glúteo Esquerdo',
    shapeType: 'polygon',
    points: '155,300 200,300 200,370 145,360',
    center: { x: 175, y: 335 }
  },
  {
    id: 'back-gluteo-dir',
    region: 'glúteo',
    side: 'right',
    view: 'back',
    label: 'Glúteo Direito',
    shapeType: 'polygon',
    points: '200,300 245,300 255,360 200,370',
    center: { x: 225, y: 335 }
  },

  // 9. Pernas (Coxas Posteriores)
  {
    id: 'back-perna-esq',
    region: 'perna',
    side: 'left',
    view: 'back',
    label: 'Perna Esquerda (Coxa Posterior)',
    shapeType: 'polygon',
    points: '145,360 200,370 192,510 148,510',
    center: { x: 172, y: 420 }
  },
  {
    id: 'back-perna-dir',
    region: 'perna',
    side: 'right',
    view: 'back',
    label: 'Perna Direita (Coxa Posterior)',
    shapeType: 'polygon',
    points: '200,370 255,360 252,510 208,510',
    center: { x: 228, y: 420 }
  },

  // 10. Canelas (Panturrilhas)
  {
    id: 'back-canela-esq',
    region: 'canela',
    side: 'left',
    view: 'back',
    label: 'Canela / Panturrilha Esquerda',
    shapeType: 'polygon',
    points: '148,510 192,510 188,645 152,645',
    center: { x: 170, y: 575 }
  },
  {
    id: 'back-canela-dir',
    region: 'canela',
    side: 'right',
    view: 'back',
    label: 'Canela / Panturrilha Direita',
    shapeType: 'polygon',
    points: '208,510 252,510 248,645 212,645',
    center: { x: 230, y: 575 }
  },

  // 11. Pés (Calcanhares)
  {
    id: 'back-pe-esq',
    region: 'pé',
    side: 'left',
    view: 'back',
    label: 'Pé Esquerdo (Calcanhar)',
    shapeType: 'polygon',
    points: '152,645 188,645 186,705 146,705',
    center: { x: 167, y: 675 }
  },
  {
    id: 'back-pe-dir',
    region: 'pé',
    side: 'right',
    view: 'back',
    label: 'Pé Direito (Calcanhar)',
    shapeType: 'polygon',
    points: '212,645 248,645 254,705 214,705',
    center: { x: 233, y: 675 }
  },

  // =========================================================================
  // 3. LADO ESQUERDO (view: 'left', perfil voltado para a esquerda)
  // Todas as regiões laterais são side: 'left'
  // =========================================================================

  {
    id: 'left-cabeca',
    region: 'cabeça',
    side: 'left',
    view: 'left',
    label: 'Cabeça (Perfil Esquerdo)',
    shapeType: 'ellipse',
    ellipseCoords: { cx: 205, cy: 75, rx: 34, ry: 48 },
    center: { x: 205, y: 75 }
  },
  {
    id: 'left-ombro',
    region: 'ombro',
    side: 'left',
    view: 'left',
    label: 'Ombro Esquerdo',
    shapeType: 'polygon',
    points: '185,135 235,135 235,185 185,185',
    center: { x: 210, y: 160 }
  },
  {
    id: 'left-braco',
    region: 'braço',
    side: 'left',
    view: 'left',
    label: 'Braço Esquerdo',
    shapeType: 'polygon',
    points: '185,185 235,185 230,265 190,265',
    center: { x: 210, y: 225 }
  },
  {
    id: 'left-antebraco',
    region: 'antebraço',
    side: 'left',
    view: 'left',
    label: 'Antebraço Esquerdo',
    shapeType: 'polygon',
    points: '190,265 230,265 220,365 180,365',
    center: { x: 205, y: 315 }
  },
  {
    id: 'left-mao',
    region: 'mão',
    side: 'left',
    view: 'left',
    label: 'Mão Esquerda',
    shapeType: 'polygon',
    points: '180,365 220,365 212,445 174,445',
    center: { x: 195, y: 405 }
  },
  {
    id: 'left-torax',
    region: 'tórax',
    side: 'left',
    view: 'left',
    label: 'Tórax Esquerdo',
    shapeType: 'polygon',
    points: '170,140 215,140 215,225 170,225',
    center: { x: 192, y: 182 }
  },
  {
    id: 'left-barriga',
    region: 'barriga',
    side: 'left',
    view: 'left',
    label: 'Barriga / Lombar Esquerda',
    shapeType: 'polygon',
    points: '172,225 215,225 215,310 172,310',
    center: { x: 193, y: 267 }
  },
  {
    id: 'left-gluteo',
    region: 'glúteo',
    side: 'left',
    view: 'left',
    label: 'Glúteo Esquerdo',
    shapeType: 'polygon',
    points: '195,305 245,305 240,375 190,375',
    center: { x: 217, y: 340 }
  },
  {
    id: 'left-perna',
    region: 'perna',
    side: 'left',
    view: 'left',
    label: 'Perna Esquerda (Coxa)',
    shapeType: 'polygon',
    points: '175,365 240,375 225,510 178,510',
    center: { x: 204, y: 435 }
  },
  {
    id: 'left-canela',
    region: 'canela',
    side: 'left',
    view: 'left',
    label: 'Canela Esquerda',
    shapeType: 'polygon',
    points: '178,510 225,510 220,645 182,645',
    center: { x: 201, y: 575 }
  },
  {
    id: 'left-pe',
    region: 'pé',
    side: 'left',
    view: 'left',
    label: 'Pé Esquerdo',
    shapeType: 'polygon',
    points: '165,645 235,645 235,705 165,705',
    center: { x: 200, y: 675 }
  },

  // =========================================================================
  // 4. LADO DIREITO (view: 'right', perfil voltado para a direita)
  // Todas as regiões laterais são side: 'right'
  // =========================================================================

  {
    id: 'right-cabeca',
    region: 'cabeça',
    side: 'right',
    view: 'right',
    label: 'Cabeça (Perfil Direito)',
    shapeType: 'ellipse',
    ellipseCoords: { cx: 195, cy: 75, rx: 34, ry: 48 },
    center: { x: 195, y: 75 }
  },
  {
    id: 'right-ombro',
    region: 'ombro',
    side: 'right',
    view: 'right',
    label: 'Ombro Direito',
    shapeType: 'polygon',
    points: '165,135 215,135 215,185 165,185',
    center: { x: 190, y: 160 }
  },
  {
    id: 'right-braco',
    region: 'braço',
    side: 'right',
    view: 'right',
    label: 'Braço Direito',
    shapeType: 'polygon',
    points: '165,185 215,185 210,265 170,265',
    center: { x: 190, y: 225 }
  },
  {
    id: 'right-antebraco',
    region: 'antebraço',
    side: 'right',
    view: 'right',
    label: 'Antebraço Direito',
    shapeType: 'polygon',
    points: '170,265 210,265 220,365 180,365',
    center: { x: 195, y: 315 }
  },
  {
    id: 'right-mao',
    region: 'mão',
    side: 'right',
    view: 'right',
    label: 'Mão Direita',
    shapeType: 'polygon',
    points: '180,365 220,365 226,445 188,445',
    center: { x: 205, y: 405 }
  },
  {
    id: 'right-torax',
    region: 'tórax',
    side: 'right',
    view: 'right',
    label: 'Tórax Direito',
    shapeType: 'polygon',
    points: '185,140 230,140 230,225 185,225',
    center: { x: 208, y: 182 }
  },
  {
    id: 'right-barriga',
    region: 'barriga',
    side: 'right',
    view: 'right',
    label: 'Barriga / Lombar Direita',
    shapeType: 'polygon',
    points: '185,225 228,225 228,310 185,310',
    center: { x: 207, y: 267 }
  },
  {
    id: 'right-gluteo',
    region: 'glúteo',
    side: 'right',
    view: 'right',
    label: 'Glúteo Direito',
    shapeType: 'polygon',
    points: '155,305 205,305 210,375 160,375',
    center: { x: 183, y: 340 }
  },
  {
    id: 'right-perna',
    region: 'perna',
    side: 'right',
    view: 'right',
    label: 'Perna Direita (Coxa)',
    shapeType: 'polygon',
    points: '160,375 225,365 222,510 175,510',
    center: { x: 196, y: 435 }
  },
  {
    id: 'right-canela',
    region: 'canela',
    side: 'right',
    view: 'right',
    label: 'Canela Direita',
    shapeType: 'polygon',
    points: '175,510 222,510 218,645 180,645',
    center: { x: 199, y: 575 }
  },
  {
    id: 'right-pe',
    region: 'pé',
    side: 'right',
    view: 'right',
    label: 'Pé Direito',
    shapeType: 'polygon',
    points: '165,645 235,645 235,705 165,705',
    center: { x: 200, y: 675 }
  }
];

export const VIEW_BOUNDS: Record<'front' | 'back' | 'left' | 'right', { minX: number; maxX: number; width: number }> = {
  front: { minX: 0, maxX: 400, width: 400 },
  back: { minX: 0, maxX: 400, width: 400 },
  left: { minX: 0, maxX: 400, width: 400 },
  right: { minX: 0, maxX: 400, width: 400 }
};

export const VIEW_INDEX: Record<'front' | 'back' | 'left' | 'right', number> = {
  front: 0,
  back: 1,
  left: 2,
  right: 3
};
