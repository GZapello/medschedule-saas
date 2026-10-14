import React, { useEffect, useRef, useState } from 'react';
import { useMobileLayout } from '../../hooks/useMobileLayout';

/** Keep the original graphic coordinates and controls; fit its physical bounds on mobile. */
export function MobileGraphicViewport({ children }: { children: React.ReactNode }) {
  const mobile = useMobileLayout();
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 1, height: 1, available: 1 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const moved = useRef(false);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  useEffect(() => {
    if (!mobile || !viewport.current || !content.current) return;
    const measure = () => {
      if (viewport.current && content.current) setBounds({ width: content.current.scrollWidth, height: content.current.offsetHeight, available: viewport.current.clientWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current); observer.observe(content.current);
    return () => observer.disconnect();
  }, [mobile, children]);
  if (!mobile) return <div className="w-full overflow-x-auto pb-1.5 scrollbar-thin">{children}</div>;
  const fit = Math.min(1, bounds.available / bounds.width);
  const scale = fit * zoom;
  const maxX = Math.max(0, (bounds.width * scale - bounds.available) / 2);
  const maxY = Math.max(0, bounds.height * scale - bounds.height * fit);
  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));
  return <div className="w-full min-w-0">
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <button type="button" aria-label="Diminuir odontograma" disabled={zoom === 1} onClick={() => { setZoom(value => Math.max(1, value - .5)); setPan({ x: 0, y: 0 }); }} className="border rounded-lg px-3">−</button>
      <button type="button" aria-label="Ampliar odontograma" disabled={zoom === 4} onClick={() => setZoom(value => Math.min(4, value + .5))} className="border rounded-lg px-3">+</button>
      <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="border rounded-lg px-3">Ajustar à tela</button>
      {zoom > 1 && <span className="text-xs">Arraste para mover; toque para marcar.</span>}
    </div>
    <div ref={viewport} className="relative w-full" style={{ height: Math.max(1, bounds.height * fit), overflow: 'clip', touchAction: zoom > 1 ? 'none' : 'pan-y' }}
      onPointerDownCapture={event => {
        if (zoom === 1) return;
        moved.current = false;
        drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        if (Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) < 5 && !moved.current) return;
        moved.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setPan({ x: clamp(drag.current.panX + event.clientX - drag.current.x, maxX), y: clamp(drag.current.panY + event.clientY - drag.current.y, maxY) });
      }}
      onTouchStart={event => {
        if (event.touches.length === 2) pinch.current = { distance: Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY), zoom };
      }}
      onTouchMove={event => {
        if (event.touches.length !== 2 || !pinch.current) return;
        const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
        setZoom(Math.max(1, Math.min(4, pinch.current.zoom * distance / pinch.current.distance)));
        moved.current = true;
      }}
      onTouchEnd={() => { pinch.current = null; }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onClickCapture={event => { if (moved.current) { event.preventDefault(); event.stopPropagation(); moved.current = false; } }}>
      <div ref={content} style={{ width: 'max-content', position: 'absolute', left: '50%', transformOrigin: 'top center', transform: `translateX(-50%) translate(${clamp(pan.x, maxX)}px, ${clamp(pan.y, maxY)}px) scale(${scale})` }}>{children}</div>
    </div>
  </div>;
}
