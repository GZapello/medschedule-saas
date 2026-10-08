import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';
import { positionTourCard, TourRect } from './tourPosition';

export const OnboardingSpotlight: React.FC = () => {
  const tour = useOnboarding();
  if (!tour.isTourActive || !tour.currentStep) return null;
  return <TourSpotlightStep key={`${tour.currentTour?.id}:${tour.currentStep.id}`} />;
};

const visible = (element: HTMLElement) => {
  const r = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return element.isConnected && r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
};

const TourSpotlightStep: React.FC = () => {
  const { currentStep: step, currentTour, currentStepIndex, nextStep, prevStep, closeTour, skipTour } = useOnboarding();
  const card = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ rect: TourRect; top: number; left: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [suspended, setSuspended] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (layout && !suspended && !focused.current) {
      focused.current = true;
      card.current?.focus({ preventScroll: true });
    }
  }, [layout, suspended]);

  useEffect(() => {
    if (!step) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    let target: HTMLElement | null = null, lastRect: DOMRect | null = null;
    let stableSince = 0, scrolled = false;
    const started = performance.now();
    setLayout(null); setFailed(false);
    const invalidate = () => {
      // Resize and scroll events arrive before the next polling pass. Never paint a stale card.
      if (card.current) card.current.style.visibility = 'hidden';
      setLayout(null); lastRect = null; stableSince = 0;
    };
    const resize = () => { scrolled = false; invalidate(); };
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.addEventListener('scroll', invalidate, true);
    window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: step.route } }));
    window.dispatchEvent(new CustomEvent('zemda-tour-prepare', { detail: {
      route: step.route, sidebar: step.target.startsWith('[data-tour="nav-') && step.target !== '[data-tour="nav-settings"]'
    } }));
    const tick = () => {
      if (cancelled) return;
      const page = document.querySelector<HTMLElement>(`[data-tour-page="${step.route}"]`);
      const blockingDialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).some(visible);
      setSuspended(blockingDialog);
      const scope = step.target.startsWith('[data-tour="nav-') ? document : page;
      // Exact target only. Duplicate matches are treated as an error, never guessed.
      const matches = Array.from(scope?.querySelectorAll<HTMLElement>(step.target) || []).filter(visible);
      const pageLoading = page?.querySelector('[data-tour-loading="true"], [aria-busy="true"]');
      const found = page && visible(page) && !pageLoading && matches.length === 1 ? matches[0] : null;
      if (!found || blockingDialog) {
        setLayout(null); lastRect = null; stableSince = 0;
        if (!blockingDialog && performance.now() - started > 12000) setFailed(true);
        timer = setTimeout(tick, Math.min(600, 100 + (performance.now() - started) / 15));
        return;
      }
      if (found !== target) { target = found; scrolled = false; lastRect = null; stableSince = 0; }
      if (!scrolled) {
        target.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center', inline: 'center' });
        scrolled = true;
      }
      const r = target.getBoundingClientRect();
      const onScreen = r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
      const front = document.elementsFromPoint(
        Math.max(0, Math.min(window.innerWidth - 1, r.left + r.width / 2)),
        Math.max(0, Math.min(window.innerHeight - 1, r.top + r.height / 2))
      ).find(element => !element.closest('[data-tour-overlay]'));
      const editingTarget = target.contains(document.activeElement) && document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
      // Some legacy modals lack aria-modal. Hit testing also detects those and dropdowns.
      if (onScreen && ((front && !target.contains(front) && !front.contains(target)) || editingTarget)) {
        setSuspended(true); setLayout(null); lastRect = null; stableSince = 0;
        timer = setTimeout(tick, 120);
        return;
      }
      const stable = lastRect && ['top', 'left', 'width', 'height'].every(key => Math.abs(r[key as keyof DOMRect] as number - (lastRect![key as keyof DOMRect] as number)) < 0.5);
      if (!stable || !onScreen) { stableSince = performance.now(); setLayout(null); }
      lastRect = r;
      if (onScreen && stable && performance.now() - stableSince >= 240 && card.current) {
        // Re-read only after navigation, sidebar transition and scrolling have settled.
        const padding = 4;
        const rect = { top: Math.max(0, r.top - padding), left: Math.max(0, r.left - padding),
          bottom: Math.min(window.innerHeight, r.bottom + padding), right: Math.min(window.innerWidth, r.right + padding), width: 0, height: 0 };
        rect.width = rect.right - rect.left; rect.height = rect.bottom - rect.top;
        const size = card.current.getBoundingClientRect();
        const obstacles = Array.from(document.querySelectorAll<HTMLElement>('[data-tour^="nav-"], [data-tour^="tab-"], [data-tour^="personal-"][data-tour$="-tab"], [data-tour-group]'))
          .filter(element => element !== target && visible(element))
          .map(element => element.getBoundingClientRect())
          .filter(box => box.right > 0 && box.bottom > 0 && box.left < window.innerWidth && box.top < window.innerHeight);
        const pos = positionTourCard(rect, size.width, size.height, window.innerWidth, window.innerHeight, obstacles);
        setLayout(prev => prev && JSON.stringify(prev) === JSON.stringify({ rect, ...pos }) ? prev : { rect, ...pos });
        setFailed(false);
      }
      timer = setTimeout(tick, 80);
    };
    timer = setTimeout(tick, 80);
    return () => {
      cancelled = true; clearTimeout(timer);
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.removeEventListener('scroll', invalidate, true);
    };
  }, [step, attempt]);

  if (!step || !currentTour) return null;
  const total = currentTour.steps.length;
  const ready = !!layout && !suspended;
  return <div className="fixed inset-0 pointer-events-none z-[9998]" data-tour-overlay>
    {ready && <div data-tour-highlight style={{ position: 'fixed', top: layout.rect.top, left: layout.rect.left,
      width: layout.rect.width, height: layout.rect.height, borderRadius: 10, border: '2px solid #0d9488',
      boxShadow: '0 0 0 9999px rgba(15,23,42,0.22)' }} />}
    {!ready && !suspended && <div role="status" className="pointer-events-auto fixed bottom-4 right-4 max-w-[calc(100vw-32px)] rounded-xl border border-teal-100 bg-white p-3 shadow-lg text-xs text-slate-700 flex items-center gap-3">
      <span>{failed ? 'Não foi possível localizar esta etapa.' : 'Preparando a próxima etapa…'}</span>
      {failed && <button className="font-bold text-teal-700" onClick={() => setAttempt(n => n + 1)}>Tentar novamente</button>}
      <button onClick={closeTour} aria-label="Fechar guia"><X size={16} /></button>
    </div>}
    <div ref={card} tabIndex={-1} role="dialog" aria-modal="false" aria-label={step.title} data-tour-card data-tour-step={step.id}
      data-tour-target={step.target} data-tour-route={step.route}
      onKeyDown={event => {
        if ((event.target as HTMLElement).matches('input,textarea,select,[contenteditable=true]')) return;
        if (event.key === 'ArrowRight' && ready) { event.preventDefault(); nextStep(); }
        if (event.key === 'ArrowLeft' && ready) { event.preventDefault(); prevStep(); }
      }}
      style={{ position: 'fixed', top: layout?.top || 0, left: layout?.left || 0, width: 328,
        maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto',
        visibility: ready ? 'visible' : 'hidden' }}
      className="pointer-events-auto bg-white rounded-2xl shadow-xl border border-teal-100 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-extrabold uppercase text-teal-700" aria-live="polite">Passo {currentStepIndex + 1} de {total}</span>
        <button type="button" onClick={closeTour} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Fechar guia"><X size={16} /></button>
      </div>
      <div><h3 className="text-sm font-bold text-slate-900">{step.title}</h3>
        <p className="text-xs leading-relaxed text-slate-600 mt-1">{step.description}</p></div>
      <div role="progressbar" aria-label="Progresso do tour" aria-valuenow={currentStepIndex + 1} aria-valuemin={0} aria-valuemax={total} className="h-1 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-teal-500" style={{ width: `${(currentStepIndex + 1) / total * 100}%` }} />
      </div>
      <div className="flex justify-between items-center gap-2">
        <button type="button" onClick={skipTour} className="text-[11px] text-slate-500 hover:text-slate-800">Pular tour</button>
        <div className="flex gap-1">
          {currentStepIndex > 0 && <button type="button" onClick={prevStep} className="flex items-center rounded-lg bg-slate-100 px-2 py-2 text-xs font-semibold"><ChevronLeft size={14} />Anterior</button>}
          <button type="button" onClick={nextStep} className="flex items-center gap-1 rounded-lg bg-teal-600 hover:bg-teal-700 px-3 py-2 text-xs font-bold text-white">{currentStepIndex === total - 1 ? 'Finalizar' : 'Próximo'}<ChevronRight size={14} /></button>
        </div>
      </div>
    </div>
  </div>;
};
