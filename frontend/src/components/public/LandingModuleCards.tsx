import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronRight, ClipboardList, Layers3, Target, History, X, type LucideIcon } from 'lucide-react';
import { LANDING_MODULES, moduleHref } from '../../../../backend/src/seo/landingContent';
import { RevealItem } from './RevealOnScroll';
import { MODULE_BENEFITS } from './landingModuleBenefits';

type Module = typeof LANDING_MODULES[number];
type Placement = { side: 'left' | 'right' | 'below'; left?: number; top?: number; width?: number; maxHeight?: number };
type Active = { id: string; open: boolean };
const benefitIcons = [ClipboardList, Layers3, Target, History];

function ModuleExpansion({ module, open, placement, panelRef, onClose, onNavigate, onEnter, onLeave, onKeyDown }: {
  module: Module; open: boolean; placement: Placement; panelRef: React.RefObject<HTMLElement>;
  onClose: () => void; onNavigate: (event: React.MouseEvent<HTMLAnchorElement>, module: Module) => void;
  onEnter: () => void; onLeave: () => void; onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const content = MODULE_BENEFITS[module.id];
  return <section ref={panelRef} id={`module-expansion-${module.id}`} role="region"
    aria-labelledby={`module-expansion-heading-${module.id}`} aria-hidden={!open}
    className="zl-module-expansion" data-side={placement.side} data-open={open}
    style={placement.side === 'below' ? undefined : { left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight }}
    onPointerEnter={onEnter} onPointerLeave={onLeave} onKeyDown={onKeyDown}>
    <button className="zl-expansion-close" aria-label={`Fechar informações de ${module.name}`} onClick={onClose} tabIndex={open ? 0 : -1}><X size={17} aria-hidden="true" /></button>
    <h4 id={`module-expansion-heading-${module.id}`}>Como o {module.name} pode ajudar</h4>
    <p className="zl-expansion-description">{content.description}</p>
    <ul>{content.benefits.map(({ lead, detail }, index) => {
      const Icon = benefitIcons[index];
      return <li key={lead}><span className="zl-expansion-icon"><Icon size={17} aria-hidden="true" /></span><p><strong>{lead}</strong> {detail}</p></li>;
    })}</ul>
    <a className="zl-expansion-link" href={moduleHref(module)} tabIndex={open ? 0 : -1} onClick={event => onNavigate(event, module)}>Ver detalhes do módulo <ArrowRight size={15} aria-hidden="true" /></a>
  </section>;
}

export function LandingModuleCards({ icons, onNavigate }: {
  icons: Record<string, LucideIcon>; onNavigate: (event: React.MouseEvent<HTMLAnchorElement>, module: Module) => void;
}) {
  const [active, setActive] = useState<Active | null>(null);
  const [placement, setPlacement] = useState<Placement>({ side: 'below' });
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const removalTimer = useRef<ReturnType<typeof setTimeout>>();
  const suppressHover = useRef(false);
  const shell = useCallback((id: string) => gridRef.current?.querySelector<HTMLElement>(`[data-module="${id}"]`), []);
  const clearHover = () => { clearTimeout(hoverTimer.current); clearTimeout(closeTimer.current); };
  const close = useCallback((restoreFocus = false) => {
    clearTimeout(hoverTimer.current); clearTimeout(closeTimer.current); clearTimeout(removalTimer.current);
    if (restoreFocus && active) shell(active.id)?.querySelector<HTMLButtonElement>('.zl-module-more')?.focus();
    setActive(previous => previous && { ...previous, open: false });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    removalTimer.current = setTimeout(() => setActive(null), reduced ? 0 : 350);
  }, [active, shell]);

  const measure = useCallback((id: string): Placement => {
    const card = shell(id);
    if (!card) return { side: 'below' };
    const rect = card.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const right = viewport - rect.right - 16, left = rect.left - 16;
    // Narrow layouts use an intentional in-flow disclosure, never an overlay on controls.
    if (viewport <= 860 || Math.max(left, right) < 320) return { side: 'below' };
    const side = right >= 380 || right >= left ? 'right' : 'left';
    const width = Math.min(400, side === 'right' ? right : left);
    const headerBottom = Math.max(0, document.querySelector('.zemda-landing header')?.getBoundingClientRect().bottom || 0);
    const maxHeight = Math.max(100, window.innerHeight - headerBottom - 24);
    const height = Math.min(panelRef.current?.offsetHeight || 350, maxHeight);
    const top = Math.max(headerBottom + 12, Math.min(rect.top, window.innerHeight - height - 12));
    return { side, left: side === 'right' ? rect.right - 1 : rect.left - width + 1, top, width, maxHeight };
  }, [shell]);
  const open = (id: string) => {
    clearHover(); clearTimeout(removalTimer.current);
    setPlacement(measure(id)); setActive({ id, open: true });
  };
  const leave = () => {
    clearHover();
    closeTimer.current = setTimeout(() => {
      if (panelRef.current?.contains(document.activeElement)) return;
      close();
    }, 140);
  };
  useEffect(() => () => {
    clearTimeout(hoverTimer.current); clearTimeout(closeTimer.current); clearTimeout(removalTimer.current);
  }, []);

  // One set of global listeners exists only while a disclosure is open.
  useLayoutEffect(() => {
    if (!active?.open) return;
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setPlacement(measure(active.id))); };
    const inside = (target: EventTarget | null) => target instanceof Node && (shell(active.id)?.contains(target) || panelRef.current?.contains(target));
    const outside = (event: Event) => { if (!inside(event.target)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); suppressHover.current = true; close(!!panelRef.current?.contains(document.activeElement)); } };
    const observer = new ResizeObserver(update);
    if (panelRef.current) observer.observe(panelRef.current);
    const card = shell(active.id);
    if (card) observer.observe(card);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true);
      document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); document.removeEventListener('keydown', escape);
    };
  }, [active, close, measure, shell]);

  const selected = LANDING_MODULES.find(module => module.id === active?.id);
  const panel = selected && active && <ModuleExpansion key={selected.id} module={selected} open={active.open} placement={placement} panelRef={panelRef}
    onClose={() => { suppressHover.current = true; close(true); }} onNavigate={(event, module) => { onNavigate(event, module); close(); }} onEnter={clearHover} onLeave={leave}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      if (event.shiftKey && event.target === panelRef.current?.querySelector('button')) {
        event.preventDefault(); shell(selected.id)?.querySelector<HTMLButtonElement>('.zl-module-more')?.focus();
      } else if (!event.shiftKey && event.target === panelRef.current?.querySelector('a')) {
        event.preventDefault(); shell(selected.id)?.querySelector<HTMLAnchorElement>('.zl-module-link')?.focus(); close();
      }
    }} />;

  return <div ref={gridRef} className="zl-modules" onPointerMove={() => { suppressHover.current = false; }}>
    {LANDING_MODULES.map((module, index) => {
      const Icon = icons[module.id], expanded = active?.id === module.id && active.open;
      return <div key={module.id} className="zl-full-height zl-module-shell" data-module={module.id} data-expanded={!!expanded}
        onPointerEnter={event => {
          if (suppressHover.current || event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover)').matches || window.innerWidth <= 860) return;
          clearHover(); hoverTimer.current = setTimeout(() => open(module.id), 120);
        }} onPointerLeave={event => { if (event.pointerType === 'mouse') leave(); }}>
        <RevealItem distancePx={16} delayMs={(index % 5) * 50} durationMs={550} className="zl-module-reveal">
          <article id={`modulo-${module.id}`} className={`zl-module zl-module-${module.id}`} onClick={event => {
            if (!(event.target as HTMLElement).closest('a,button')) open(module.id);
          }}>
            <span className="zl-module-icon"><Icon size={16} aria-hidden="true" /></span>
            <p className="zl-profession">{module.profession}</p><h3>{module.name}</h3>
            <button type="button" className="zl-module-more" aria-label={`Como o ${module.name} pode ajudar`} aria-expanded={!!expanded}
              aria-controls={active?.id === module.id ? `module-expansion-${module.id}` : undefined}
              onClick={() => expanded ? close() : open(module.id)}
              onKeyDown={event => {
                if (event.key === 'Tab' && !event.shiftKey && expanded) { event.preventDefault(); panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }
              }}><ChevronRight size={16} aria-hidden="true" /></button>
            <ul className="zl-bullets">{module.features.map(item => <li key={item}><Check aria-hidden="true" size={16} /><span>{item}</span></li>)}</ul>
            <a href={moduleHref(module)} onClick={event => onNavigate(event, module)} className="zl-module-link" aria-label={`Conhecer módulo ${module.name}`}>Conhecer módulo <ArrowRight size={13} /></a>
          </article>
        </RevealItem>
        {active?.id === module.id && placement.side === 'below' && panel}
      </div>;
    })}
    {panel && placement.side !== 'below' && createPortal(<div className="zemda-landing zl-module-portal">{panel}</div>, document.body)}
  </div>;
}
