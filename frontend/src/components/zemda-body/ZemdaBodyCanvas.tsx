import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BODY_REGIONS, BodyRegionDef, VIEW_BOUNDS, VIEW_INDEX } from './bodyRegionsData';
import {
  Activity,
  Droplet,
  ShieldAlert,
  Zap,
  Scissors,
  Crosshair,
  Gauge,
  Ruler,
  MessageSquare,
  AlertTriangle
} from 'lucide-react';

export interface BodyStrokePoint {
  x: number; // 0..1 normalizado dentro da vista
  y: number; // 0..1 normalizado
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
  coordinates?: { x: number; y: number }; // 0..1 dentro da vista ou no grid 1000x1000
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

  // Traço atualmente em desenho
  const [currentStroke, setCurrentStroke] = useState<BodyStroke | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  // Histórico local para Undo / Redo por vista
  const [undoStack, setUndoStack] = useState<Record<string, BodyStroke[][]>>({
    front: [],
    back: [],
    left: [],
    right: []
  });
  const [redoStack, setRedoStack] = useState<Record<string, BodyStroke[][]>>({
    front: [],
    back: [],
    left: [],
    right: []
  });

  // Imagem fotográfica correspondente
  const imageSrc = bodyModel === 'female' ? '/Corpo_Feminino.jpg' : '/Corpo_masculino.jpg';

  // Configuração de ViewBox SVG
  const isSingleView = activeView !== 'all';
  const effectiveView: 'front' | 'back' | 'left' | 'right' = isSingleView ? activeView : 'front';
  const viewBounds = VIEW_BOUNDS[effectiveView];

  const svgViewBox = isSingleView
    ? `${viewBounds.minX} 0 250 1000`
    : '0 0 1000 1000';

  // Helper para converter traço em path SVG 'd'
  const strokeToPath = (stroke: BodyStroke, viewName: 'front' | 'back' | 'left' | 'right'): string => {
    if (!stroke.points || stroke.points.length === 0) return '';
    const minX = VIEW_BOUNDS[viewName].minX;
    const width = VIEW_BOUNDS[viewName].width;

    return stroke.points.reduce((acc, pt, index) => {
      // Coordenada absoluta no grid 1000x1000
      const x = minX + pt.x * width;
      const y = pt.y * 1000;
      return index === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `${acc} L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }, '');
  };

  // Determina em qual vista um clique no panorama recai
  const getPointView = (gridX: number): 'front' | 'back' | 'left' | 'right' => {
    if (gridX < 250) return 'front';
    if (gridX < 500) return 'back';
    if (gridX < 750) return 'left';
    return 'right';
  };

  // Tratamento de Ponteiro: Início do Desenho / Borracha
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly || tool === 'select') return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    // Normaliza na área clicada
    let targetView: 'front' | 'back' | 'left' | 'right';
    let normX: number;
    let normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    if (isSingleView) {
      targetView = activeView as 'front' | 'back' | 'left' | 'right';
      normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    } else {
      const globalNormX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const gridX = globalNormX * 1000;
      targetView = getPointView(gridX);
      const minX = VIEW_BOUNDS[targetView].minX;
      normX = Math.max(0, Math.min(1, (gridX - minX) / 250));
    }

    // Se estiver em modo Borracha, apaga o traço mais próximo
    if (tool === 'eraser') {
      handleEraserAction(targetView, normX, normY);
      return;
    }

    // Modo Caneta ou Marca-texto
    setIsDrawing(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);

    const isHighlighter = tool === 'highlighter';
    const newStroke: BodyStroke = {
      strokeId: 'stk-' + Math.random().toString(36).substring(2, 9),
      toolType: isHighlighter ? 'highlighter' : 'pen',
      color: isHighlighter ? '#f59e0b' : penColor,
      strokeWidth: isHighlighter ? highlighterWidth : penWidth,
      opacity: isHighlighter ? 0.38 : 0.95,
      points: [{ x: normX, y: normY }]
    };

    setCurrentStroke(newStroke);
  };

  // Movimento do Ponteiro
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing || !currentStroke || tool === 'select' || readOnly) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();

    let targetView: 'front' | 'back' | 'left' | 'right';
    let normX: number;
    let normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (isSingleView) {
      targetView = activeView as 'front' | 'back' | 'left' | 'right';
      normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    } else {
      const globalNormX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const gridX = globalNormX * 1000;
      targetView = getPointView(gridX);
      const minX = VIEW_BOUNDS[targetView].minX;
      normX = Math.max(0, Math.min(1, (gridX - minX) / 250));
    }

    // Adiciona ponto se houver distância mínima (otimização de performance)
    const pts = currentStroke.points;
    const last = pts[pts.length - 1];
    const dx = normX - last.x;
    const dy = normY - last.y;
    if (Math.hypot(dx, dy) >= 0.003) {
      setCurrentStroke({
        ...currentStroke,
        points: [...pts, { x: normX, y: normY }]
      });
    }
  };

  // Fim do Desenho
  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing || !currentStroke) return;
    setIsDrawing(false);
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {}

    const targetView: 'front' | 'back' | 'left' | 'right' = isSingleView
      ? (activeView as any)
      : getPointView(currentStroke.points[0].x * 250);

    const prevStrokes = drawings[targetView] || [];
    const updated = [...prevStrokes, currentStroke];

    // Atualiza stack de Undo
    setUndoStack(prev => ({
      ...prev,
      [targetView]: [...(prev[targetView] || []), prevStrokes]
    }));
    setRedoStack(prev => ({
      ...prev,
      [targetView]: []
    }));

    setCurrentStroke(null);
    onSaveViewDrawings(targetView, updated);
  };

  // Ação da Borracha
  const handleEraserAction = (viewName: 'front' | 'back' | 'left' | 'right', normX: number, normY: number) => {
    const list = drawings[viewName] || [];
    if (list.length === 0) return;

    // Procura traço com ponto a uma distância de até 0.04 normalizado
    const threshold = 0.04;
    const filtered = list.filter(stroke => {
      return !stroke.points.some(pt => Math.hypot(pt.x - normX, pt.y - normY) < threshold);
    });

    if (filtered.length !== list.length) {
      setUndoStack(prev => ({
        ...prev,
        [viewName]: [...(prev[viewName] || []), list]
      }));
      setRedoStack(prev => ({
        ...prev,
        [viewName]: []
      }));
      onSaveViewDrawings(viewName, filtered);
    }
  };

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
      className={`relative w-full select-none overflow-hidden rounded-2xl bg-white shadow-md border border-slate-200 transition-all ${
        isSingleView ? 'max-w-[480px] mx-auto aspect-[250/1000]' : 'aspect-[1024/768] w-full'
      }`}
      style={{ touchAction: tool === 'select' ? 'auto' : 'none' }}
    >
      {/* CAMADA 1: Imagem fotográfica corporal (1024x768) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img
          src={imageSrc}
          alt={`Mapa Anatômico ${bodyModel === 'female' ? 'Feminino' : 'Masculino'}`}
          className="h-full object-cover transition-all duration-300"
          style={{
            width: isSingleView ? '400%' : '100%',
            maxWidth: 'none',
            marginLeft: isSingleView
              ? activeView === 'front'
                ? '0%'
                : activeView === 'back'
                ? '-100%'
                : activeView === 'left'
                ? '-200%'
                : '-300%'
              : '0%'
          }}
        />
      </div>

      {/* CAMADA 2: SVG de regiões clínicas clicáveis com identificadores anatômicos */}
      <svg
        viewBox={svgViewBox}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        style={{
          pointerEvents: tool === 'select' ? 'auto' : 'none',
          zIndex: 10
        }}
      >
        <defs>
          <filter id="hoverGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#0284c7" floodOpacity="0.4" />
          </filter>
        </defs>

        {visibleRegions.map(reg => {
          const isSelected = selectedRegionId === reg.id;
          const hasMarker = markers.some(m => m.bodyRegion === reg.region && m.view === reg.view);

          const baseClass = `transition-all duration-150 cursor-pointer outline-none ${
            isSelected
              ? 'fill-amber-500/40 stroke-amber-600 stroke-[3]'
              : hasMarker
              ? 'fill-teal-500/20 stroke-teal-500/60 stroke-[1.5] hover:fill-teal-500/35 hover:stroke-teal-600'
              : 'fill-transparent stroke-transparent hover:fill-sky-400/25 hover:stroke-sky-500/70 stroke-[2]'
          }`;

          if (reg.shapeType === 'ellipse') {
            return (
              <ellipse
                key={reg.id}
                id={reg.id}
                data-region={reg.region}
                data-side={reg.side}
                data-view={reg.view}
                data-sex={bodyModel}
                cx={reg.coords.cx}
                cy={reg.coords.cy}
                rx={reg.coords.rx}
                ry={reg.coords.ry}
                className={baseClass}
                onClick={() => onSelectRegion(isSelected ? null : reg)}
              >
                <title>{reg.label}</title>
              </ellipse>
            );
          }

          return (
            <rect
              key={reg.id}
              id={reg.id}
              data-region={reg.region}
              data-side={reg.side}
              data-view={reg.view}
              data-sex={bodyModel}
              x={reg.coords.x}
              y={reg.coords.y}
              width={reg.coords.width}
              height={reg.coords.height}
              rx={reg.coords.rxRadius || 8}
              className={baseClass}
              onClick={() => onSelectRegion(isSelected ? null : reg)}
            >
              <title>{reg.label}</title>
            </rect>
          );
        })}
      </svg>

      {/* CAMADA 3: Marcadores clínicos estruturados sobre o corpo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 20 }}
      >
        {visibleMarkers.map((marker, idx) => {
          // Encontra a região anatômica para determinar a coordenada
          const regionDef = BODY_REGIONS.find(r => r.region === marker.bodyRegion && r.view === marker.view);
          let posX = 0;
          let posY = 0;

          if (marker.coordinates?.x !== undefined && marker.coordinates?.y !== undefined) {
            // Se possui coordenadas normalizadas salvas
            if (isSingleView) {
              posX = marker.coordinates.x * 100;
              posY = marker.coordinates.y * 100;
            } else {
              const minX = VIEW_BOUNDS[marker.view].minX;
              posX = ((minX + marker.coordinates.x * 250) / 1000) * 100;
              posY = marker.coordinates.y * 100;
            }
          } else if (regionDef) {
            if (isSingleView) {
              const minX = VIEW_BOUNDS[marker.view].minX;
              posX = ((regionDef.center.x - minX) / 250) * 100;
              posY = (regionDef.center.y / 1000) * 100;
            } else {
              posX = (regionDef.center.x / 1000) * 100;
              posY = (regionDef.center.y / 1000) * 100;
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

              {/* Tooltip Hover Discreto */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:flex flex-col items-center z-30 pointer-events-none">
                <div className="bg-slate-900 text-white text-[11px] font-medium py-1 px-2.5 rounded-lg shadow-xl whitespace-nowrap border border-slate-700">
                  <span className="font-bold text-teal-300 capitalize">{marker.bodyRegion}</span>: {marker.markerType} {marker.value ? `(${marker.value})` : ''}
                  {marker.notes && <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">{marker.notes}</p>}
                </div>
                <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
              </div>
            </div>
          );
        })}
      </div>

      {/* CAMADA 4: Desenhos vetoriais da Caneta / Marca-texto com Pointer Events */}
      <svg
        viewBox={svgViewBox}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          pointerEvents: tool !== 'select' && !readOnly ? 'auto' : 'none',
          zIndex: 30,
          cursor:
            readOnly
              ? 'default'
              : tool === 'pen'
              ? 'crosshair'
              : tool === 'highlighter'
              ? 'cell'
              : tool === 'eraser'
              ? 'not-allowed'
              : 'default'
        }}
      >
        {/* Renderiza traços salvos por vista */}
        {(['front', 'back', 'left', 'right'] as const).map(viewKey => {
          if (isSingleView && viewKey !== activeView) return null;
          const strokesList = drawings[viewKey] || [];

          return strokesList.map(stk => (
            <path
              key={stk.strokeId}
              d={strokeToPath(stk, viewKey)}
              fill="none"
              stroke={stk.color}
              strokeWidth={stk.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={stk.opacity}
            />
          ));
        })}

        {/* Traço atualmente em desenho */}
        {currentStroke && (
          <path
            d={strokeToPath(currentStroke, effectiveView)}
            fill="none"
            stroke={currentStroke.color}
            strokeWidth={currentStroke.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={currentStroke.opacity}
          />
        )}
      </svg>
    </div>
  );
};
