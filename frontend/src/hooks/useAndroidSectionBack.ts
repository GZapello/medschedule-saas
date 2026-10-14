import { useEffect } from 'react';

/** Let an active nested section consume Back after overlays/drawer, before route navigation. */
export function useAndroidSectionBack(enabled: boolean, onBack: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const back = (event: Event) => { event.preventDefault(); onBack(); };
    window.addEventListener('zemda-section-back', back);
    return () => window.removeEventListener('zemda-section-back', back);
  }, [enabled, onBack]);
}
