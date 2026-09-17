import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  BodyPanoramaRegion,
  getPanoramaRegions,
  getRegionLabel
} from './bodyRegionsData';
import { Eye, Layers } from 'lucide-react';

export interface BodyStrokePoint {
  x: number; // 0..1 normalizado relativo ao panorama (1024x768)
  y: number; // 0..1 normalizado relativo ao panorama (1024x768)
}

export interface BodyStroke {
  strokeId: string;
  toolType: 'pen' | 'highlighter';
  color: string;
  strokeWidth: number;
  opacity: number;
  points: BodyStrokePoint[];
}

export interface BodyMarkerItem {
  id?: string;
  bodyRegion: string;
  side: 'right' | 'left' | 'midline';
  view: 'front' | 'back' | 'left' | 'right';
  markerType: string;
  value?: string;
  severity?: string;
  notes?: string;
  coordinates?: { x: number; y: number };
  detailsJson?: any;
}

export type BodyViewMode = 'all' | 'front' | 'back' | 'left' | 'right';

export interface ZemdaBodyCanvasProps {
  bodyModel?: 'female' | 'male';
  selectedRegions?: string[];
  onToggleRegion?: (regionId: string) => void;
  tool?: 'select' | 'pen' | 'eraser';
  penColor?: string;
  penWidth?: number;
  drawings?: BodyStroke[];
  onSaveDrawings?: (strokes: BodyStroke[]) => void;
  readOnly?: boolean;
  // Integração com o ZemdaPersonal (Mapeamento Muscular e Heatmap de Volume)
  volumeHeatmap?: Record<string, number>; // ex: { peitoral: 14, quadriceps: 16 }
  activeMuscleHighlight?: {
    primary?: string[];
    secondary?: string[];
  };
  initialViewMode?: BodyViewMode;
}

// Distância euclidiana de um ponto até um segmento de reta
function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

export const ZemdaBodyCanvas: React.FC<ZemdaBodyCanvasProps> = ({
  bodyModel = 'male',
  selectedRegions = [],
  onToggleRegion = () => {},
  tool = 'select',
  penColor = '#dc2626',
  penWidth = 4,
  drawings = [],
  onSaveDrawings = () => {},
  readOnly = false,
  volumeHeatmap,
  activeMuscleHighlight,
  initialViewMode = 'all'
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Modo de visualização de vistas (Todas / Frontal / Posterior / Lateral D / Lateral E)
  const [viewMode, setViewMode] = useState<BodyViewMode>(initialViewMode);

  // Refs para desenho síncrono contínuo de alta performance (sem lag de closure do React)
  const isDrawingRef = useRef<boolean>(false);
  const activeStrokeRef = useRef<BodyStroke | null>(null);
  const drawingsRef = useRef<BodyStroke[]>(drawings);
  const eraserModifiedRef = useRef<boolean>(false);

  // Posição visual do cursor da borracha
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);

  // Região sob o cursor no modo seleção
  const [hoveredRegion, setHoveredRegion] = useState<BodyPanoramaRegion | null>(null);

  // Sincroniza drawingsRef com a prop drawings
  useEffect(() => {
    drawingsRef.current = drawings;
    redrawCanvas();
  }, [drawings]);

  // Obtém as regiões calibradas para o modelo selecionado (1024 x 768)
  const regions = getPanoramaRegions(bodyModel);

  // Imagem de alta fidelidade
  const imgSrc = bodyModel === 'female' ? '/Corpo_Feminino.jpg' : '/Corpo_masculino.jpg';

  // Redesenha todos os traços no Canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const strokes = drawingsRef.current || [];
    for (const stk of strokes) {
      if (!stk.points || stk.points.length === 0) continue;
      ctx.save();
      ctx.strokeStyle = stk.color || '#dc2626';
      ctx.fillStyle = stk.color || '#dc2626';
      ctx.lineWidth = (stk.strokeWidth || 4) * 2; // escala 2x para resolução 2048x1536
      ctx.globalAlpha = stk.opacity !== undefined ? stk.opacity : 1.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      for (let i = 0; i < stk.points.length; i++) {
        const px = stk.points[i].x * canvas.width;
        const py = stk.points[i].y * canvas.height;
        if (i === 0) {
          ctx.moveTo(px, py);
          if (stk.points.length === 1) {
            ctx.arc(px, py, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  // Redesenha ao carregar ou redimensionar
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas, viewMode]);

  // Aplica borracha com detecção contínua por raio de colisão
  const applyEraserAt = useCallback(
    (nx: number, ny: number) => {
      const eraserRadius = 0.035; // 3.5% do canvas normalizado
      let modified = false;
      const nextStrokes: BodyStroke[] = [];

      for (const stk of drawingsRef.current) {
        if (!stk.points || stk.points.length === 0) continue;

        let currentSegment: BodyStrokePoint[] = [];

        for (let i = 0; i < stk.points.length; i++) {
          const pt = stk.points[i];
          const distPt = Math.hypot(pt.x - nx, pt.y - ny);

          let segmentCollided = false;
          if (i > 0) {
            const prev = stk.points[i - 1];
            const distSeg = distToSegment(nx, ny, prev.x, prev.y, pt.x, pt.y);
            if (distSeg < eraserRadius) {
              segmentCollided = true;
            }
          }

          if (distPt >= eraserRadius && !segmentCollided) {
            currentSegment.push(pt);
          } else {
            modified = true;
            if (currentSegment.length > 0) {
              nextStrokes.push({
                ...stk,
                strokeId: `${stk.strokeId}_sub_${nextStrokes.length}`,
                points: currentSegment
              });
              currentSegment = [];
            }
          }
        }

        if (currentSegment.length > 0) {
          nextStrokes.push({
            ...stk,
            strokeId: modified ? `${stk.strokeId}_sub_${nextStrokes.length}` : stk.strokeId,
            points: currentSegment
          });
        }
      }

      if (modified) {
        drawingsRef.current = nextStrokes;
        eraserModifiedRef.current = true;
        redrawCanvas();
      }
    },
    [redrawCanvas]
  );

  // Converte evento de ponteiro em coordenadas normalizadas [0, 1] relativas à imagem completa (1024x768)
  const getNormalizedCoords = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    // Se estiver em modo de foco, mapeia para a região do panorama correspondente
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (viewMode === 'all') {
      return { x: relX, y: relY };
    } else if (viewMode === 'front') {
      return { x: relX * 0.25, y: relY };
    } else if (viewMode === 'back') {
      return { x: 0.25 + relX * 0.25, y: relY };
    } else if (viewMode === 'left') {
      return { x: 0.50 + relX * 0.25, y: relY };
    } else if (viewMode === 'right') {
      return { x: 0.75 + relX * 0.25, y: relY };
    }
    return { x: relX, y: relY };
  };

  // Eventos de Ponteiro para Caneta e Borracha
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || tool === 'select') return;

    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    eraserModifiedRef.current = false;

    const coords = getNormalizedCoords(e);
    if (!coords) return;

    if (tool === 'pen') {
      const newStroke: BodyStroke = {
        strokeId: `stk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        toolType: 'pen',
        color: penColor,
        strokeWidth: penWidth,
        opacity: 1.0,
        points: [coords]
      };
      activeStrokeRef.current = newStroke;

      // Renderiza ponto inicial
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.fillStyle = penColor;
        ctx.beginPath();
        const px = coords.x * canvas.width;
        const py = coords.y * canvas.height;
        ctx.arc(px, py, (penWidth * 2) / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (tool === 'eraser') {
      setEraserPos({ x: e.clientX, y: e.clientY });
      applyEraserAt(coords.x, coords.y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || tool === 'select') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const coords = getNormalizedCoords(e);
    if (!coords) return;

    if (tool === 'eraser') {
      setEraserPos({ x: e.clientX, y: e.clientY });
      if (isDrawingRef.current) {
        applyEraserAt(coords.x, coords.y);
      }
      return;
    }

    if (tool === 'pen' && isDrawingRef.current && activeStrokeRef.current) {
      e.preventDefault();
      const stroke = activeStrokeRef.current;
      const prevPt = stroke.points[stroke.points.length - 1];
      stroke.points.push(coords);

      const ctx = canvas.getContext('2d');
      if (ctx && prevPt) {
        ctx.save();
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penWidth * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(prevPt.x * canvas.width, prevPt.y * canvas.height);
        ctx.lineTo(coords.x * canvas.width, coords.y * canvas.height);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || tool === 'select') return;

    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (tool === 'pen' && activeStrokeRef.current) {
      const completedStroke = activeStrokeRef.current;
      activeStrokeRef.current = null;
      const updatedDrawings = [...drawingsRef.current, completedStroke];
      drawingsRef.current = updatedDrawings;
      onSaveDrawings(updatedDrawings);
    } else if (tool === 'eraser' && eraserModifiedRef.current) {
      eraserModifiedRef.current = false;
      onSaveDrawings([...drawingsRef.current]);
    }
  };

  const handlePointerLeave = () => {
    setEraserPos(null);
  };

  // Clique em região anatômica (ativo apenas no modo seleção)
  // Utiliza baseRegion para manter associação unificada independentemente da vista
  const handleClickRegion = (reg: BodyPanoramaRegion) => {
    if (readOnly || tool !== 'select') return;
    onToggleRegion(reg.baseRegion || reg.id);
  };

  // ViewBox do SVG conforme a vista selecionada
  const svgViewBox =
    viewMode === 'all'
      ? '0 0 1024 768'
      : viewMode === 'front'
      ? '0 0 256 768'
      : viewMode === 'back'
      ? '256 0 256 768'
      : viewMode === 'left'
      ? '512 0 256 768'
      : '768 0 256 768';

  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* SELETOR DE VISTAS (Frontal, Posterior, Lateral Direita, Lateral Esquerda, Todas) */}
      <div className="w-full max-w-[1100px] mb-2 flex items-center justify-between flex-wrap gap-2 px-1">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className="px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-default bg-white text-teal-700 shadow-xs"
          >
            Todas as Vistas
          </button>
        </div>

        {/* Indicador de Status e Legenda */}
        <div className="text-right">
          {tool === 'select' ? (
            hoveredRegion ? (
              <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full shadow-xs">
                {hoveredRegion.label}
                {hoveredRegion.side !== 'midline' && ` (${hoveredRegion.side === 'right' ? 'Direito' : 'Esquerdo'})`}
                {volumeHeatmap && hoveredRegion.muscleGroup && volumeHeatmap[hoveredRegion.muscleGroup] && (
                  <span className="ml-1.5 font-extrabold text-teal-700">
                    • {volumeHeatmap[hoveredRegion.muscleGroup]} séries/sem
                  </span>
                )}
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                {readOnly
                  ? 'Modo visualização histórica (somente leitura)'
                  : 'Clique nas articulações ou regiões corporais'}
              </span>
            )
          ) : tool === 'pen' ? (
            <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-full shadow-xs">
              Caneta: desenho livre sobre o corpo
            </span>
          ) : (
            <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full shadow-xs">
              Borracha: passe para apagar traços manuais
            </span>
          )}
        </div>
      </div>

      {/* Wrapper do Mapa Corporal */}
      <div
        ref={containerRef}
        className="mapa-corporal-wrapper shadow-lg border border-slate-200 relative overflow-hidden"
        style={{
          width: '100%',
          maxWidth: viewMode === 'all' ? '1100px' : '480px',
          borderRadius: '16px',
          backgroundColor: '#f8f9fa'
        }}
      >
        <style>{`
          .regiao {
            fill: rgba(33, 150, 243, 0);
            stroke: rgba(33, 150, 243, 0);
            stroke-width: 2.5;
            cursor: ${readOnly || tool !== 'select' ? 'default' : 'pointer'};
            transition: all 0.2s ease-in-out;
          }

          .regiao:hover {
            ${
              readOnly || tool !== 'select'
                ? ''
                : `
              fill: rgba(33, 150, 243, 0.35);
              stroke: rgba(33, 150, 243, 0.85);
            `
            }
          }

          .marcado {
            fill: rgba(244, 67, 54, 0.50) !important;
            stroke: rgba(244, 67, 54, 0.95) !important;
            stroke-width: 3 !important;
          }

          .articulacao-ponto {
            stroke-width: 2.5;
            cursor: ${readOnly || tool !== 'select' ? 'default' : 'pointer'};
            transition: all 0.2s ease-in-out;
          }

          .articulacao-ponto:hover {
            stroke-width: 4;
            filter: drop-shadow(0 0 6px rgba(13, 148, 136, 0.8));
          }

          .heatmap-low {
            fill: rgba(16, 185, 129, 0.35) !important;
            stroke: rgba(16, 185, 129, 0.8) !important;
          }
          .heatmap-med {
            fill: rgba(59, 130, 246, 0.45) !important;
            stroke: rgba(59, 130, 246, 0.85) !important;
          }
          .heatmap-high {
            fill: rgba(245, 158, 11, 0.55) !important;
            stroke: rgba(245, 158, 11, 0.9) !important;
          }
          .heatmap-peak {
            fill: rgba(239, 68, 68, 0.65) !important;
            stroke: rgba(239, 68, 68, 0.95) !important;
          }

          .muscle-primary {
            fill: rgba(14, 165, 233, 0.65) !important;
            stroke: #0284c7 !important;
            stroke-width: 3.5 !important;
            filter: drop-shadow(0 0 8px rgba(14, 165, 233, 0.7));
          }
          .muscle-secondary {
            fill: rgba(168, 85, 247, 0.50) !important;
            stroke: #9333ea !important;
            stroke-width: 3 !important;
          }
        `}</style>

        {/* CAMADA 1: Imagem Anatômica */}
        <div
          className="relative w-full overflow-hidden"
          style={{
            aspectRatio: viewMode === 'all' ? '1024 / 768' : '256 / 768'
          }}
        >
          <img
            src={imgSrc}
            alt={`Mapa Corporal - ${bodyModel === 'female' ? 'Feminino' : 'Masculino'}`}
            className="absolute top-0 left-0 h-full max-w-none pointer-events-none select-none"
            style={{
              width: viewMode === 'all' ? '100%' : '400%',
              left:
                viewMode === 'all'
                  ? '0%'
                  : viewMode === 'front'
                  ? '0%'
                  : viewMode === 'back'
                  ? '-100%'
                  : viewMode === 'left'
                  ? '-200%'
                  : '-300%'
            }}
            draggable={false}
          />

          {/* CAMADA 2: SVG Overlay de Regiões Selecionáveis e Articulações */}
          <svg
            viewBox={svgViewBox}
            className="absolute top-0 left-0 w-full h-full z-10"
            preserveAspectRatio="none"
            role="img"
            aria-label="Mapa Anatômico Interativo"
            style={{
              pointerEvents: tool === 'select' && !readOnly ? 'auto' : 'none'
            }}
          >
            {regions.map(r => {
              const isSelected =
                selectedRegions.includes(r.id) ||
                selectedRegions.includes(r.baseRegion) ||
                selectedRegions.includes(r.region);

              // Volume Heatmap para ZemdaPersonal
              let heatmapClass = '';
              if (volumeHeatmap && r.muscleGroup && volumeHeatmap[r.muscleGroup] !== undefined) {
                const vol = volumeHeatmap[r.muscleGroup];
                if (vol >= 20) heatmapClass = 'heatmap-peak';
                else if (vol >= 16) heatmapClass = 'heatmap-high';
                else if (vol >= 10) heatmapClass = 'heatmap-med';
                else if (vol > 0) heatmapClass = 'heatmap-low';
              }

              // Destaque muscular de exercício ativo
              let muscleClass = '';
              if (activeMuscleHighlight) {
                const isPrim =
                  (r.muscleGroup && activeMuscleHighlight.primary?.includes(r.muscleGroup)) ||
                  activeMuscleHighlight.primary?.includes(r.baseRegion);
                const isSec =
                  (r.muscleGroup && activeMuscleHighlight.secondary?.includes(r.muscleGroup)) ||
                  activeMuscleHighlight.secondary?.includes(r.baseRegion);
                if (isPrim) muscleClass = 'muscle-primary';
                else if (isSec) muscleClass = 'muscle-secondary';
              }

              const baseClass = `${r.isJoint ? 'articulacao-ponto' : 'regiao'} ${isSelected ? 'marcado' : ''} ${heatmapClass} ${muscleClass}`;

              if (r.shapeType === 'ellipse' && r.ellipseCoords) {
                return (
                  <ellipse
                    key={r.id}
                    id={r.id}
                    className={baseClass}
                    cx={r.ellipseCoords.cx}
                    cy={r.ellipseCoords.cy}
                    rx={r.ellipseCoords.rx}
                    ry={r.ellipseCoords.ry}
                    fill={r.isJoint && !isSelected && !muscleClass ? 'rgba(13, 148, 136, 0.15)' : undefined}
                    stroke={r.isJoint && !isSelected && !muscleClass ? 'rgba(13, 148, 136, 0.7)' : undefined}
                    onClick={() => handleClickRegion(r)}
                    onMouseEnter={() => {
                      if (tool === 'select') setHoveredRegion(r);
                    }}
                    onMouseLeave={() => setHoveredRegion(null)}
                    role="button"
                    tabIndex={tool === 'select' ? 0 : -1}
                    aria-label={r.label}
                    aria-pressed={isSelected}
                    onKeyDown={e => {
                      if (tool === 'select' && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        handleClickRegion(r);
                      }
                    }}
                  >
                    <title>{`${r.label} (${r.side === 'right' ? 'Direito' : r.side === 'left' ? 'Esquerdo' : 'Central'})`}</title>
                  </ellipse>
                );
              }

              return (
                <polygon
                  key={r.id}
                  id={r.id}
                  className={baseClass}
                  points={r.points || ''}
                  onClick={() => handleClickRegion(r)}
                  onMouseEnter={() => {
                    if (tool === 'select') setHoveredRegion(r);
                  }}
                  onMouseLeave={() => setHoveredRegion(null)}
                  role="button"
                  tabIndex={tool === 'select' ? 0 : -1}
                  aria-label={r.label}
                  aria-pressed={isSelected}
                  onKeyDown={e => {
                    if (tool === 'select' && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleClickRegion(r);
                    }
                  }}
                >
                  <title>{`${r.label} (${r.side === 'right' ? 'Direito' : r.side === 'left' ? 'Esquerdo' : 'Central'})`}</title>
                </polygon>
              );
            })}
          </svg>

          {/* CAMADA 3: Canvas Transparente Independente para Caneta e Borracha */}
          <canvas
            ref={canvasRef}
            width={2048}
            height={1536}
            className="absolute top-0 left-0 w-full h-full z-20 pointer-events-auto"
            style={{
              pointerEvents: tool === 'select' || readOnly ? 'none' : 'auto',
              touchAction: 'none',
              cursor: tool === 'pen' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'default'
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
          />

          {/* Indicador Visual do Cursor da Borracha */}
          {tool === 'eraser' && eraserPos && containerRef.current && (
            <div
              className="pointer-events-none absolute rounded-full border-2 border-rose-500 bg-rose-500/20 shadow-sm z-30 transition-transform -translate-x-1/2 -translate-y-1/2"
              style={{
                left: eraserPos.x - containerRef.current.getBoundingClientRect().left,
                top: eraserPos.y - containerRef.current.getBoundingClientRect().top,
                width: `${(containerRef.current.getBoundingClientRect().width * 0.06).toFixed(0)}px`,
                height: `${(containerRef.current.getBoundingClientRect().width * 0.06).toFixed(0)}px`
              }}
            />
          )}
        </div>
      </div>

      {/* Rótulos das 4 Vistas */}
      {viewMode === 'all' && (
        <div className="w-full max-w-[1100px] mt-2 px-2 flex justify-around text-xs font-bold text-slate-500 uppercase tracking-wider">
          <div className="w-1/4 text-center">Frente</div>
          <div className="w-1/4 text-center">Verso</div>
          <div className="w-1/4 text-center">Perfil Esquerdo</div>
          <div className="w-1/4 text-center">Perfil Direito</div>
        </div>
      )}

      {/* Legenda de Heatmap de Volume (quando ativo) */}
      {volumeHeatmap && (
        <div className="mt-3 flex items-center gap-3 text-xs bg-slate-50 border border-slate-200 px-4 py-1.5 rounded-full text-slate-600">
          <span className="font-bold">Volume Semanal:</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-emerald-500/40 border border-emerald-600" />
            1-9 séries
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-blue-500/40 border border-blue-600" />
            10-15 séries
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-amber-500/50 border border-amber-600" />
            16-20 séries
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-rose-500/60 border border-rose-600" />
            20+ séries (Prioridade)
          </span>
        </div>
      )}
    </div>
  );
};
