import { useEffect, useRef } from 'react';

/** Keep only Personal's mobile dialogs inside the visible area when the keyboard opens. */
export function usePersonalMobileViewport(open: boolean, enabled = true) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    const viewport = window.visualViewport;
    if (!open || !enabled || !element || !viewport) return;
    const update = () => {
      if (viewport.scale !== 1) return;
      element.style.setProperty('--personal-visible-height', `${viewport.height}px`);
      element.style.setProperty('--personal-visible-top', `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      element.style.removeProperty('--personal-visible-height');
      element.style.removeProperty('--personal-visible-top');
    };
  }, [open, enabled]);
  return ref;
}
