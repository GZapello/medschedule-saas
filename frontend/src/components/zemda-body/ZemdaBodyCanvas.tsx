import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  BodyPanoramaRegion,
  getPanoramaRegions,
  getRegionLabel
} from './bodyRegionsData';

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

export interface ZemdaBodyCanvasProps {
  bodyModel: 'female' | 'male';
  selectedRegions: string[];
  onToggleRegion: (regionId: string) => void;
  tool: 'select' | 'pen' | 'eraser';
  penColor?: string;
  penWidth?: number;
  drawings: BodyStroke[];
  onSaveDrawings: (strokes: BodyStroke[]) => void;
  readOnly?: boolean;
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
  bodyModel,
  selectedRegions,
  onToggleRegion,
  tool,
  penColor = '#dc2626',
  penWidth = 4,
  drawings,
  onSaveDrawings,
  readOnly = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
  }, [redrawCanvas, bodyModel]);

  // Aplica a borracha sobre o traço no ponto especificado
  const applyEraserAt = useCallback(
    (nx: number, ny: number) => {
      const eraserRadius = 0.03; // raio proporcional calibrado no espaço [0, 1]
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

  // Converte evento de ponteiro em coordenadas normalizadas [0, 1]
  const getNormalizedCoords = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  // Eventos Nativos de Ponteiro para Caneta e Borracha
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

      // Renderiza o ponto inicial imediatamente no Canvas
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

      // Traça imediatamente no contexto 2D com suavização de hardware
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
  const handleClickRegion = (regId: string) => {
    if (readOnly || tool !== 'select') return;
    onToggleRegion(regId);
  };

  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* Indicador de Status sob o Cursor */}
      <div className="h-6 mb-1 text-center">
        {tool === 'select' ? (
          hoveredRegion ? (
            <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-0.5 rounded-full shadow-xs animate-in fade-in duration-100">
              {hoveredRegion.label}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">
              {readOnly
                ? 'Modo visualização histórica (somente leitura)'
                : 'Modo Seleção: clique diretamente nas regiões para marcá-las'}
            </span>
          )
        ) : tool === 'pen' ? (
          <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-0.5 rounded-full shadow-xs">
            Modo Caneta: desenhe livremente sobre o corpo (não altera seleções)
          </span>
        ) : (
          <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-0.5 rounded-full shadow-xs">
            Modo Borracha: passe sobre os traços para apagá-los (não altera regiões selecionadas)
          </span>
        )}
      </div>

      {/* Wrapper do Mapa Corporal Panorâmico */}
      <div
        ref={containerRef}
        className="mapa-corporal-wrapper shadow-lg border border-slate-200 relative"
      >
        <style>{`
          .mapa-corporal-wrapper {
            position: relative;
            width: 100%;
            max-width: 1100px;
            margin: 0 auto;
            border-radius: 12px;
            overflow: hidden;
            background-color: #f8f9fa;
          }

          .img-anatomia {
            width: 100%;
            height: auto;
            display: block;
            pointer-events: none;
            user-select: none;
          }

          .svg-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10;
          }

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
            fill: rgba(244, 67, 54, 0.48) !important;
            stroke: rgba(244, 67, 54, 0.95) !important;
            stroke-width: 3 !important;
          }

          .canvas-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 20;
          }
        `}</style>

        {/* CAMADA 1: Imagem Anatômica Panorâmica Contínua (1024x768) */}
        <img
          src={imgSrc}
          alt={`Mapa Corporal Panorâmico - ${bodyModel === 'female' ? 'Feminino' : 'Masculino'}`}
          className="img-anatomia"
          draggable={false}
        />

        {/* CAMADA 2: SVG Overlay de Regiões Selecionáveis (1024x768) */}
        <svg
          viewBox="0 0 1024 768"
          className="svg-overlay"
          preserveAspectRatio="none"
          role="img"
          aria-label="Mapa Anatômico Interativo"
          style={{
            pointerEvents: tool === 'select' && !readOnly ? 'auto' : 'none'
          }}
        >
          {regions.map(r => {
            const isSelected = selectedRegions.includes(r.id);
            const className = `regiao ${isSelected ? 'marcado' : ''}`;

            if (r.shapeType === 'ellipse' && r.ellipseCoords) {
              return (
                <ellipse
                  key={r.id}
                  id={r.id}
                  className={className}
                  cx={r.ellipseCoords.cx}
                  cy={r.ellipseCoords.cy}
                  rx={r.ellipseCoords.rx}
                  ry={r.ellipseCoords.ry}
                  onClick={() => handleClickRegion(r.id)}
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
                      handleClickRegion(r.id);
                    }
                  }}
                >
                  <title>{r.label}</title>
                </ellipse>
              );
            }

            return (
              <polygon
                key={r.id}
                id={r.id}
                className={className}
                points={r.points || ''}
                onClick={() => handleClickRegion(r.id)}
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
                    handleClickRegion(r.id);
                  }
                }}
              >
                <title>{r.label}</title>
              </polygon>
            );
          })}
        </svg>

        {/* CAMADA 3: Canvas Transparente Independente para Caneta e Borracha (2048x1536) */}
        <canvas
          ref={canvasRef}
          width={2048}
          height={1536}
          className="canvas-overlay"
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

      {/* Rótulos das 4 Vistas */}
      <div className="w-full max-w-[1100px] mt-2 px-2 flex justify-around text-xs font-bold text-slate-500 uppercase tracking-wider">
        <div className="w-1/4 text-center">Frente</div>
        <div className="w-1/4 text-center">Verso</div>
        <div className="w-1/4 text-center">Perfil Esquerdo</div>
        <div className="w-1/4 text-center">Perfil Direito</div>
      </div>
    </div>
  );
};
