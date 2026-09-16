import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  BODY_REGIONS,
  BodyRegionDef,
  mapToPanorama,
  mapPointsToPanorama
} from './bodyRegionsData';
import {
  Activity,
  Droplet,
  ShieldAlert,
  Zap,
  Scissors,
  Crosshair,
  Gauge,
  Ruler,
  MessageSquare
} from 'lucide-react';

export interface BodyStrokePoint {
  x: number; // 0..1 normalizado dentro da vista
  y: number; // 0..1 normalizado dentro da vista
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
  coordinates?: { x: number; y: number }; // 0..1 dentro da vista
  detailsJson?: any;
}

interface ZemdaBodyCanvasProps {
  bodyModel: 'female' | 'male';
  activeView: 'front' | 'back' | 'left' | 'right' | 'all';
  tool: 'select' | 'pen' | 'highlighter' | 'eraser';
  penColor: string;
  penWidth: number;
  highlighterWidth: number;
  selectedRegionId: string | null;
  onSelectRegion: (region: BodyRegionDef | null) => void;
  markers: BodyMarkerItem[];
  drawings: Record<string, BodyStroke[]>;
  onSaveViewDrawings: (view: 'front' | 'back' | 'left' | 'right', strokes: BodyStroke[]) => void;
  readOnly?: boolean;
  onMarkerClick?: (marker: BodyMarkerItem) => void;
}

export const ZemdaBodyCanvas: React.FC<ZemdaBodyCanvasProps> = ({
  bodyModel,
  activeView,
  tool,
  penColor,
  penWidth,
  highlighterWidth,
  selectedRegionId,
  onSelectRegion,
  markers,
  drawings,
  onSaveViewDrawings,
  readOnly = false,
  onMarkerClick
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Refs síncronos para desenho contínuo sem lag de closure do React
  const isDrawingRef = useRef<boolean>(false);
  const activeStrokeRef = useRef<BodyStroke | null>(null);
  const drawingsRef = useRef<Record<string, BodyStroke[]>>(drawings);
  const eraserModifiedRef = useRef<boolean>(false);

  // Posição visual do cursor da borracha
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);

  // Sincroniza drawingsRef com a prop drawings sempre que mudar externamente
  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);

  // Determina se estamos em vista única ou panorama
  const isSingleView = activeView !== 'all';
  const effectiveView: 'front' | 'back' | 'left' | 'right' = isSingleView ? activeView : 'front';

  // Dimensões nativas de renderização (2x para retina crispness)
  const nativeWidth = isSingleView ? 800 : 1024;
  const nativeHeight = isSingleView ? 1520 : 768;

  // ViewBox do SVG
  const svgViewBox = isSingleView ? '0 0 400 760' : '0 0 1024 768';

  // Seleciona a imagem correta isolada
  const getImageSrc = (): string => {
    if (!isSingleView) {
      return bodyModel === 'female' ? '/Corpo_Feminino.jpg' : '/Corpo_masculino.jpg';
    }
    const prefix = bodyModel === 'female' ? '/corpo_feminino_' : '/corpo_masculino_';
    switch (activeView) {
      case 'front':
        return `${prefix}frente.png`;
      case 'back':
        return `${prefix}verso.png`;
      case 'left':
        return `${prefix}lado_esquerdo.png`;
      case 'right':
        return `${prefix}lado_direito.png`;
      default:
        return `${prefix}frente.png`;
    }
  };

  // Redesenha todos os traços no Canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isSingleView) {
      const strokes = drawingsRef.current[effectiveView] || [];
      for (const stk of strokes) {
        if (!stk.points || stk.points.length === 0) continue;
        ctx.save();
        ctx.strokeStyle = stk.color;
        ctx.fillStyle = stk.color;
        ctx.lineWidth = stk.strokeWidth * 2;
        ctx.globalAlpha = stk.opacity;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        for (let i = 0; i < stk.points.length; i++) {
          const px = stk.points[i].x * canvas.width;
          const py = stk.points[i].y * canvas.height;
          if (i === 0) {
            ctx.moveTo(px, py);
            if (stk.points.length === 1) {
              ctx.arc(px, py, (stk.strokeWidth * 2) / 2, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Panorama
      const views: ('front' | 'back' | 'left' | 'right')[] = ['front', 'back', 'left', 'right'];
      for (const v of views) {
        const strokes = drawingsRef.current[v] || [];
        for (const stk of strokes) {
          if (!stk.points || stk.points.length === 0) continue;
          ctx.save();
          ctx.strokeStyle = stk.color;
          ctx.fillStyle = stk.color;
          ctx.lineWidth = stk.strokeWidth;
          ctx.globalAlpha = stk.opacity;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          ctx.beginPath();
          for (let i = 0; i < stk.points.length; i++) {
            const singleX = stk.points[i].x * 400;
            const singleY = stk.points[i].y * 760;
            const pano = mapToPanorama(singleX, singleY, v);
            const px = (pano.x / 1024) * canvas.width;
            const py = (pano.y / 768) * canvas.height;

            if (i === 0) {
              ctx.moveTo(px, py);
              if (stk.points.length === 1) {
                ctx.arc(px, py, stk.strokeWidth / 2, 0, Math.PI * 2);
                ctx.fill();
              }
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }, [isSingleView, effectiveView]);

  // Atualiza o canvas quando os desenhos ou vista mudam
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas, drawings, activeView]);

  // Distância de um ponto a um segmento de reta
  const distToSegment = (
    p: { x: number; y: number },
    v: { x: number; y: number },
    w: { x: number; y: number }
  ): number => {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  };

  // Ação da borracha contínua com corte de segmentos e redraw instantâneo
  const applyEraser = (normX: number, normY: number) => {
    const list = drawingsRef.current[effectiveView] || [];
    if (list.length === 0) return;

    const eraserRadius = 0.035; // Raio proporcional de apagamento (~14px)
    let anyModified = false;
    const nextStrokes: BodyStroke[] = [];

    for (const stroke of list) {
      if (!stroke.points || stroke.points.length === 0) continue;

      const segments: BodyStrokePoint[][] = [];
      let currentSeg: BodyStrokePoint[] = [];

      for (let i = 0; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        let isErased = Math.hypot(pt.x - normX, pt.y - normY) < eraserRadius;

        if (!isErased && i > 0) {
          const prevPt = stroke.points[i - 1];
          if (distToSegment({ x: normX, y: normY }, prevPt, pt) < eraserRadius) {
            isErased = true;
          }
        }

        if (isErased) {
          anyModified = true;
          if (currentSeg.length > 0) {
            segments.push(currentSeg);
            currentSeg = [];
          }
        } else {
          currentSeg.push(pt);
        }
      }

      if (currentSeg.length > 0) {
        segments.push(currentSeg);
      }

      for (const seg of segments) {
        nextStrokes.push({
          ...stroke,
          strokeId: stroke.strokeId + '-' + Math.random().toString(36).substring(2, 6),
          points: seg
        });
      }
    }

    if (anyModified) {
      eraserModifiedRef.current = true;
      drawingsRef.current = {
        ...drawingsRef.current,
        [effectiveView]: nextStrokes
      };
      redrawCanvas();
    }
  };

  // Setup de Pointer Events NATIVOS (garante fidelidade absoluta e impede scroll/drag)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || readOnly) return;

    const onPointerDown = (e: PointerEvent) => {
      if (tool === 'select') return;
      e.preventDefault();
      e.stopPropagation();

      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}

      isDrawingRef.current = true;
      eraserModifiedRef.current = false;

      const rect = canvas.getBoundingClientRect();
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      if (tool === 'eraser') {
        setEraserPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        applyEraser(normX, normY);
        return;
      }

      // Caneta ou Marca-texto
      const isHighlighter = tool === 'highlighter';
      const initialStroke: BodyStroke = {
        strokeId: 'stk-' + Math.random().toString(36).substring(2, 9),
        toolType: isHighlighter ? 'highlighter' : 'pen',
        color: isHighlighter ? '#f59e0b' : penColor,
        strokeWidth: isHighlighter ? highlighterWidth : penWidth,
        opacity: isHighlighter ? 0.4 : 0.95,
        points: [{ x: normX, y: normY }]
      };
      activeStrokeRef.current = initialStroke;

      // Desenha imediatamente ponto inicial no canvas
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.fillStyle = initialStroke.color;
        ctx.globalAlpha = initialStroke.opacity;
        const px = normX * canvas.width;
        const py = normY * canvas.height;
        const radius = (initialStroke.strokeWidth * (isSingleView ? 2 : 1)) / 2;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, radius), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();

      if (tool === 'eraser') {
        setEraserPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        if (isDrawingRef.current) {
          e.preventDefault();
          const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
          applyEraser(normX, normY);
        }
        return;
      }

      if (!isDrawingRef.current || !activeStrokeRef.current) return;
      e.preventDefault();

      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      const pts = activeStrokeRef.current.points;
      const lastPt = pts[pts.length - 1];

      pts.push({ x: normX, y: normY });

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.strokeStyle = activeStrokeRef.current.color;
        ctx.lineWidth = activeStrokeRef.current.strokeWidth * (isSingleView ? 2 : 1);
        ctx.globalAlpha = activeStrokeRef.current.opacity;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(lastPt.x * canvas.width, lastPt.y * canvas.height);
        ctx.lineTo(normX * canvas.width, normY * canvas.height);
        ctx.stroke();
        ctx.restore();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      setEraserPos(null);

      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}

      if (tool === 'eraser') {
        if (eraserModifiedRef.current) {
          onSaveViewDrawings(effectiveView, drawingsRef.current[effectiveView] || []);
          eraserModifiedRef.current = false;
        }
        return;
      }

      if (activeStrokeRef.current && activeStrokeRef.current.points.length > 0) {
        const prevStrokes = drawingsRef.current[effectiveView] || [];
        const updated = [...prevStrokes, activeStrokeRef.current];
        drawingsRef.current = {
          ...drawingsRef.current,
          [effectiveView]: updated
        };
        activeStrokeRef.current = null;
        onSaveViewDrawings(effectiveView, updated);
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp, { passive: false });
    canvas.addEventListener('pointercancel', onPointerUp, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, [tool, readOnly, effectiveView, penColor, penWidth, highlighterWidth, onSaveViewDrawings, isSingleView]);

  // Ícone representativo por tipo de marcador clínico
  const renderMarkerIcon = (marker: BodyMarkerItem) => {
    const type = marker.markerType;
    if (type === 'pain') return <Activity className="w-3.5 h-3.5 text-white" />;
    if (type === 'edema') return <Droplet className="w-3.5 h-3.5 text-white" />;
    if (type === 'limitation') return <ShieldAlert className="w-3.5 h-3.5 text-white" />;
    if (type === 'sensitivity') return <Zap className="w-3.5 h-3.5 text-white" />;
    if (type === 'injury') return <Crosshair className="w-3.5 h-3.5 text-white" />;
    if (type === 'scar') return <Scissors className="w-3.5 h-3.5 text-white" />;
    if (type === 'functional') return <Gauge className="w-3.5 h-3.5 text-white" />;
    if (type === 'anthropometry') return <Ruler className="w-3.5 h-3.5 text-white" />;
    return <MessageSquare className="w-3.5 h-3.5 text-white" />;
  };

  const getMarkerBadgeColor = (marker: BodyMarkerItem) => {
    const type = marker.markerType;
    if (type === 'pain') return 'bg-rose-600 border-rose-400';
    if (type === 'edema') return 'bg-sky-600 border-sky-400';
    if (type === 'limitation') return 'bg-amber-600 border-amber-400';
    if (type === 'sensitivity') return 'bg-purple-600 border-purple-400';
    if (type === 'injury') return 'bg-red-700 border-red-500';
    if (type === 'scar') return 'bg-slate-700 border-slate-500';
    if (type === 'functional') return 'bg-indigo-600 border-indigo-400';
    if (type === 'anthropometry') return 'bg-emerald-600 border-emerald-400';
    return 'bg-teal-600 border-teal-400';
  };

  // Filtra marcadores da vista atual
  const visibleMarkers = markers.filter(m => {
    if (isSingleView) return m.view === activeView;
    return true;
  });

  // Filtra regiões anatômicas da vista atual
  const visibleRegions = BODY_REGIONS.filter(r => {
    if (isSingleView) return r.view === activeView;
    return true;
  });

  return (
    <div
      ref={containerRef}
      className="relative select-none rounded-2xl bg-[#f5f6f8] shadow-md border border-slate-200 overflow-hidden"
      style={{
        height: isSingleView ? 'min(74vh, 760px)' : 'min(64vh, 768px)',
        width: isSingleView
          ? 'calc(min(74vh, 760px) * (400 / 760))'
          : 'min(calc(min(64vh, 768px) * (1024 / 768)), 100%)',
        maxWidth: '100%',
        aspectRatio: isSingleView ? '400 / 760' : '1024 / 768',
        userSelect: 'none',
        touchAction: 'none'
      }}
    >
      {/* CAMADA 1: Imagem fotográfica corporal isolada (preenchimento integral do container exato) */}
      <img
        src={getImageSrc()}
        alt={`Mapa Anatômico ${bodyModel === 'female' ? 'Feminino' : 'Masculino'} - Vista ${activeView}`}
        className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
        draggable={false}
      />

      {/* CAMADA 2: SVG transparente com os 11 recortes anatômicos principais */}
      <svg
        viewBox={svgViewBox}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        style={{
          pointerEvents: tool === 'select' ? 'auto' : 'none',
          zIndex: 10
        }}
      >
        {visibleRegions.map(reg => {
          const isSelected = selectedRegionId === reg.id;
          const hasMarker = markers.some(m => m.bodyRegion === reg.region && m.view === reg.view);

          const baseClass = `transition-colors duration-150 cursor-pointer outline-none ${
            isSelected
              ? 'fill-amber-500/40 stroke-amber-600 stroke-[3]'
              : hasMarker
              ? 'fill-teal-500/30 stroke-teal-500/80 stroke-[2] hover:fill-teal-500/45 hover:stroke-teal-600'
              : 'fill-transparent stroke-transparent hover:fill-sky-400/30 hover:stroke-sky-500/80 stroke-[2]'
          }`;

          if (isSingleView) {
            if (reg.shapeType === 'ellipse' && reg.ellipseCoords) {
              return (
                <ellipse
                  key={reg.id}
                  id={reg.id}
                  data-region={reg.region}
                  data-side={reg.side}
                  data-view={reg.view}
                  data-sex={bodyModel}
                  cx={reg.ellipseCoords.cx}
                  cy={reg.ellipseCoords.cy}
                  rx={reg.ellipseCoords.rx}
                  ry={reg.ellipseCoords.ry}
                  className={baseClass}
                  onClick={() => onSelectRegion(isSelected ? null : reg)}
                >
                  <title>{reg.label}</title>
                </ellipse>
              );
            }

            return (
              <polygon
                key={reg.id}
                id={reg.id}
                data-region={reg.region}
                data-side={reg.side}
                data-view={reg.view}
                data-sex={bodyModel}
                points={reg.points}
                className={baseClass}
                onClick={() => onSelectRegion(isSelected ? null : reg)}
              >
                <title>{reg.label}</title>
              </polygon>
            );
          } else {
            // Panorama
            if (reg.shapeType === 'ellipse' && reg.ellipseCoords) {
              const panoCenter = mapToPanorama(reg.center.x, reg.center.y, reg.view);
              return (
                <ellipse
                  key={reg.id}
                  id={reg.id}
                  data-region={reg.region}
                  data-side={reg.side}
                  data-view={reg.view}
                  data-sex={bodyModel}
                  cx={panoCenter.x}
                  cy={panoCenter.y}
                  rx={reg.ellipseCoords.rx}
                  ry={reg.ellipseCoords.ry}
                  className={baseClass}
                  onClick={() => onSelectRegion(isSelected ? null : reg)}
                >
                  <title>{reg.label}</title>
                </ellipse>
              );
            }

            const panoPoints = reg.points ? mapPointsToPanorama(reg.points, reg.view) : '';
            return (
              <polygon
                key={reg.id}
                id={reg.id}
                data-region={reg.region}
                data-side={reg.side}
                data-view={reg.view}
                data-sex={bodyModel}
                points={panoPoints}
                className={baseClass}
                onClick={() => onSelectRegion(isSelected ? null : reg)}
              >
                <title>{reg.label}</title>
              </polygon>
            );
          }
        })}
      </svg>

      {/* CAMADA 3: Marcadores clínicos estruturados com badges */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
        {visibleMarkers.map((marker, idx) => {
          const regionDef = BODY_REGIONS.find(r => r.region === marker.bodyRegion && r.view === marker.view);
          let posX = 0;
          let posY = 0;

          if (isSingleView) {
            if (marker.coordinates?.x !== undefined && marker.coordinates?.y !== undefined) {
              posX = marker.coordinates.x * 100;
              posY = marker.coordinates.y * 100;
            } else if (regionDef) {
              posX = (regionDef.center.x / 400) * 100;
              posY = (regionDef.center.y / 760) * 100;
            }
          } else {
            // Panorama
            if (regionDef) {
              const pano = mapToPanorama(regionDef.center.x, regionDef.center.y, marker.view);
              posX = (pano.x / 1024) * 100;
              posY = (pano.y / 768) * 100;
            } else if (marker.coordinates?.x !== undefined && marker.coordinates?.y !== undefined) {
              const singleX = marker.coordinates.x * 400;
              const singleY = marker.coordinates.y * 760;
              const pano = mapToPanorama(singleX, singleY, marker.view);
              posX = (pano.x / 1024) * 100;
              posY = (pano.y / 768) * 100;
            }
          }

          const badgeColor = getMarkerBadgeColor(marker);

          return (
            <div
              key={marker.id || idx}
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-115 pointer-events-auto cursor-pointer group"
              style={{ left: `${posX}%`, top: `${posY}%` }}
              onClick={() => {
                if (onMarkerClick) onMarkerClick(marker);
                if (regionDef) onSelectRegion(regionDef);
              }}
            >
              <div
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border shadow-sm text-[10px] font-extrabold text-white animate-in zoom-in duration-200 ${badgeColor}`}
                title={`${marker.bodyRegion} • ${marker.markerType} ${marker.value ? `(${marker.value})` : ''}`}
              >
                {renderMarkerIcon(marker)}
                {marker.value && <span className="pr-0.5">{marker.value}</span>}
              </div>

              {/* Tooltip Hover */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:flex flex-col items-center z-30 pointer-events-none">
                <div className="bg-slate-900 text-white text-[11px] font-medium py-1 px-2.5 rounded-lg shadow-xl whitespace-nowrap border border-slate-700">
                  <span className="font-bold text-teal-300 capitalize">{marker.bodyRegion}</span>: {marker.markerType}{' '}
                  {marker.value ? `(${marker.value})` : ''}
                  {marker.notes && <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">{marker.notes}</p>}
                </div>
                <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
              </div>
            </div>
          );
        })}
      </div>

      {/* CAMADA 4: Canvas de desenho livre contínuo e borracha com escuta nativa de Pointer Events */}
      <canvas
        ref={canvasRef}
        width={nativeWidth}
        height={nativeHeight}
        className="absolute inset-0 w-full h-full select-none"
        onPointerLeave={() => setEraserPos(null)}
        style={{
          pointerEvents: tool !== 'select' && !readOnly ? 'auto' : 'none',
          zIndex: 30,
          touchAction: 'none',
          cursor:
            readOnly
              ? 'default'
              : tool === 'pen'
              ? 'crosshair'
              : tool === 'highlighter'
              ? 'crosshair'
              : tool === 'eraser'
              ? 'none'
              : 'default'
        }}
      />

      {/* Cursor visual em anel da borracha */}
      {tool === 'eraser' && eraserPos && (
        <div
          className="pointer-events-none absolute rounded-full border-2 border-rose-500 bg-rose-400/20 -translate-x-1/2 -translate-y-1/2 shadow-sm"
          style={{
            left: eraserPos.x,
            top: eraserPos.y,
            width: 28,
            height: 28,
            zIndex: 40
          }}
        />
      )}
    </div>
  );
};
