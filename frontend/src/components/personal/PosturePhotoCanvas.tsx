import React, { useState, useRef, useEffect } from 'react';
import { SecureFileImage } from '../common/SecureFileImage';
import { Point, Stroke, StrokeSize, Region, PosturePhoto, strokeSizes, regions } from './posture';

interface Props {
  photo: PosturePhoto;
  strokes: Stroke[];
  guides?: boolean;
  tool?: 'pen' | 'line' | 'eraser' | 'select';
  strokeColor?: string;
  strokeSize?: StrokeSize;
  activeRegion?: Region;
  zoom?: number;
  pan?: { x: number; y: number };
  onPanChange?: (pan: { x: number; y: number }) => void;
  onStrokes?: (strokes: Stroke[]) => void;
  onRegion?: (region: any) => void;
  attentionRegions?: string[];
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function hitStroke(pt: Point, stroke: Stroke, thresholdNorm: number): boolean {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return false;
  if (pts.length === 1) return Math.hypot(pt[0] - pts[0][0], pt[1] - pts[0][1]) <= thresholdNorm;
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(pt, pts[i], pts[i + 1]) <= thresholdNorm) return true;
  }
  return false;
}

export function PosturePhotoCanvas({
  photo,
  strokes,
  guides,
  tool = 'select',
  strokeColor = '#f43f5e',
  strokeSize = 'medium',
  activeRegion,
  zoom = 1,
  pan = { x: 0, y: 0 },
  onPanChange,
  onStrokes
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<Point[]>([]);
  const isErasingRef = useRef(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [preview, setPreview] = useState<Point[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    drawing.current = [];
    setPreview([]);
    isErasingRef.current = false;
  }, [photo.fileId, photo.url]);

  const point = (e: React.PointerEvent): Point => {
    const r = stageRef.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))),
      Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height)))
    ];
  };

  const applyShiftSnap = (start: Point, endPt: Point, shiftKey: boolean): Point => {
    if (!shiftKey) return endPt;
    const dx = Math.abs(endPt[0] - start[0]);
    const dy = Math.abs(endPt[1] - start[1]);
    return dx >= dy ? [endPt[0], start[1]] : [start[0], endPt[1]];
  };

  const path = (pts: Point[], isLine = false) => {
    if (!pts.length) return '';
    if (isLine || pts.length <= 2) {
      return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0] * 1000},${p[1] * 1000}`).join(' ');
    }
    let d = `M${pts[0][0] * 1000},${pts[0][1] * 1000}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = ((pts[i][0] + pts[i + 1][0]) / 2) * 1000;
      const midY = ((pts[i][1] + pts[i + 1][1]) / 2) * 1000;
      d += ` Q${pts[i][0] * 1000},${pts[i][1] * 1000} ${midX},${midY}`;
    }
    const last = pts[pts.length - 1];
    d += ` L${last[0] * 1000},${last[1] * 1000}`;
    return d;
  };

  const shown =
    tool === 'line' && preview.length > 1
      ? [preview[0], preview[preview.length - 1]]
      : preview;

  const end = () => {
    isErasingRef.current = false;
    if (drawing.current.length > 1 && onStrokes && strokes.length < 100) {
      const pts =
        tool === 'line'
          ? [drawing.current[0], drawing.current[drawing.current.length - 1]]
          : drawing.current;
      const newStroke: Stroke = {
        tool: tool === 'line' ? 'line' : 'pen',
        points: pts,
        color: strokeColor,
        size: strokeSize,
        ...(activeRegion ? { region: activeRegion } : {})
      };
      onStrokes([...strokes, newStroke]);
    }
    drawing.current = [];
    setPreview([]);
  };

  const currentWidth = strokeSizes[strokeSize]?.width || 3.5;
  const eraserHitPx = strokeSizes[strokeSize]?.eraserHit || 22;
  const thresholdNorm = eraserHitPx / 650;

  const cursorClass =
    !onStrokes || tool === 'select'
      ? isPanning
        ? 'cursor-grabbing'
        : 'cursor-grab'
      : 'cursor-crosshair';

  return (
    <div
      className={`relative w-full bg-slate-900/95 rounded-2xl overflow-hidden select-none flex items-center justify-center ${cursorClass}`}
      style={{ minHeight: ready ? 380 : 240 }}
      onPointerDown={e => {
        if (tool !== 'select' || !onPanChange) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        panStartRef.current = { clientX: e.clientX, clientY: e.clientY, x: pan.x, y: pan.y };
        setIsPanning(true);
      }}
      onPointerMove={e => {
        if (!panStartRef.current || tool !== 'select' || !onPanChange) return;
        const dx = e.clientX - panStartRef.current.clientX;
        const dy = e.clientY - panStartRef.current.clientY;
        const maxPan = Math.max(120, (zoom - 1) * 260);
        onPanChange({
          x: Math.max(-maxPan, Math.min(maxPan, panStartRef.current.x + dx)),
          y: Math.max(-maxPan, Math.min(maxPan, panStartRef.current.y + dy))
        });
      }}
      onPointerUp={() => {
        panStartRef.current = null;
        setIsPanning(false);
      }}
      onPointerCancel={() => {
        panStartRef.current = null;
        setIsPanning(false);
      }}
    >
      <div
        ref={stageRef}
        className="relative w-full transition-transform duration-75 ease-out origin-center"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
        }}
        onLoadCapture={() => setReady(true)}
      >
        <SecureFileImage
          fileId={photo.fileId}
          fallbackUrl={photo.url}
          alt="Foto da avaliação postural"
          className="block w-full h-auto max-h-[68vh] object-contain mx-auto pointer-events-none"
          placeholderText="Adicione a foto nesta vista para fazer marcações"
        />

        {ready && (
          <svg
            aria-label="Área de marcação postural"
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            style={{
              touchAction: tool === 'select' ? 'pan-x pan-y' : 'none',
              pointerEvents: !onStrokes ? 'none' : undefined
            }}
            onPointerDown={e => {
              if (!onStrokes || tool === 'select') return;
              e.stopPropagation();
              if (tool === 'eraser') {
                isErasingRef.current = true;
                const i = (e.target as SVGElement).getAttribute('data-stroke');
                if (i !== null) {
                  onStrokes(strokes.filter((_, idx) => idx !== Number(i)));
                  return;
                }
                const pt = point(e);
                const remaining = strokes.filter(s => !hitStroke(pt, s, thresholdNorm));
                if (remaining.length !== strokes.length) {
                  onStrokes(remaining);
                }
                return;
              }
              if (strokes.length >= 100) return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              const startPt = point(e);
              drawing.current = [startPt];
              setPreview(drawing.current);
            }}
            onPointerMove={e => {
              if (!onStrokes || tool === 'select') return;
              if (tool === 'eraser' && isErasingRef.current) {
                const pt = point(e);
                const remaining = strokes.filter(s => !hitStroke(pt, s, thresholdNorm));
                if (remaining.length !== strokes.length) {
                  onStrokes(remaining);
                }
                return;
              }
              if (!drawing.current.length) return;
              const rawP = point(e);
              if (tool === 'line') {
                const snapped = applyShiftSnap(drawing.current[0], rawP, e.shiftKey);
                drawing.current = [drawing.current[0], snapped];
                setPreview(drawing.current);
                return;
              }
              const last = drawing.current[drawing.current.length - 1];
              if (Math.hypot(rawP[0] - last[0], rawP[1] - last[1]) < 0.0015) return;
              if (drawing.current.length < 500) {
                drawing.current = [...drawing.current, rawP];
                setPreview(drawing.current);
              }
            }}
            onPointerUp={end}
            onPointerCancel={() => {
              isErasingRef.current = false;
              drawing.current = [];
              setPreview([]);
            }}
          >
            {/* Guias posturais (Simetógrafo / Fio de Prumo) — apenas auxílio visual */}
            {guides && (
              <g pointerEvents="none">
                {/* Grade secundária discreta */}
                <g
                  stroke="#ffffff"
                  strokeWidth="0.75"
                  strokeDasharray="3 5"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.35"
                >
                  <path d="M250 0V1000 M750 0V1000 M0 120H1000 M0 220H1000 M0 350H1000 M0 540H1000 M0 740H1000 M0 900H1000" />
                </g>
                {/* Linha vertical central (Fio de Prumo) e eixos horizontais principais */}
                <g
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  strokeDasharray="7 5"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.85"
                >
                  <path d="M500 0V1000 M0 250H1000 M0 500H1000 M0 750H1000" />
                </g>
              </g>
            )}

            {/* Traços salvos nesta vista */}
            {strokes.map((s, i) => {
              const sColor = s.color || '#f43f5e';
              const sWidth = strokeSizes[s.size || 'medium']?.width || 3.5;
              const isLine = s.tool === 'line';
              const regionLabel = s.region ? regions.find(r => r[0] === s.region)?.[1] : undefined;
              return (
                <g key={i}>
                  {regionLabel && <title>{`Marcação (${regionLabel})`}</title>}
                  <path
                    d={path(s.points, isLine)}
                    fill="none"
                    stroke={sColor}
                    strokeWidth={sWidth}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {isLine && s.points.length >= 2 && (
                    <>
                      <circle
                        cx={s.points[0][0] * 1000}
                        cy={s.points[0][1] * 1000}
                        r={3.5}
                        fill={sColor}
                      />
                      <circle
                        cx={s.points[s.points.length - 1][0] * 1000}
                        cy={s.points[s.points.length - 1][1] * 1000}
                        r={3.5}
                        fill={sColor}
                      />
                    </>
                  )}
                  {tool === 'eraser' && (
                    <path
                      data-stroke={i}
                      d={path(s.points, isLine)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={eraserHitPx}
                      vectorEffect="non-scaling-stroke"
                      style={{ pointerEvents: 'stroke', cursor: 'crosshair' }}
                    />
                  )}
                </g>
              );
            })}

            {/* Pré-visualização em tempo real durante o desenho */}
            {shown.length > 1 && (
              <g pointerEvents="none">
                <path
                  d={path(shown, tool === 'line')}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={currentWidth}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {tool === 'line' && (
                  <>
                    <circle cx={shown[0][0] * 1000} cy={shown[0][1] * 1000} r={3.5} fill={strokeColor} />
                    <circle
                      cx={shown[shown.length - 1][0] * 1000}
                      cy={shown[shown.length - 1][1] * 1000}
                      r={3.5}
                      fill={strokeColor}
                    />
                  </>
                )}
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
