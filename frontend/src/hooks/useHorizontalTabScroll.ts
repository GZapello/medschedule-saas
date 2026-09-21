import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * Hook para controle de usabilidade em barras horizontais de abas:
 * - Rolagem suave automática para a aba ativa (scrollIntoView)
 * - Arraste com mouse (drag-to-scroll)
 * - Rolagem horizontal com roda do mouse (converte wheel deltaY em scrollLeft)
 * - Prevenção de clique acidental durante o arraste
 */
export function useHorizontalTabScroll<T extends HTMLElement = HTMLDivElement>(activeTabKey?: string | number) {
  const containerRef = useRef<T>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  // Rola suavemente a aba ativa para o campo de visão
  useEffect(() => {
    if (!containerRef.current || activeTabKey === undefined) return;

    // Aguarda próximo microtask para garantir renderização do DOM
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const activeEl = containerRef.current.querySelector<HTMLElement>('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [activeTabKey]);

  // Início do arraste pelo ponteiro do mouse
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Apenas botão principal (esquerdo)
    if (e.button !== 0 || !containerRef.current) return;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    startXRef.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeftRef.current = containerRef.current.scrollLeft;
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.3;
    if (Math.abs(walk) > 4) {
      hasMovedRef.current = true;
    }
    containerRef.current.scrollLeft = scrollLeftRef.current - walk;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  // Rolagem por roda do mouse horizontal
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current) return;
    // Se houver delta vertical significativo e pouco delta horizontal, converte em scroll horizontal
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && Math.abs(e.deltaY) > 5) {
      containerRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // Previne clique involuntário na aba caso o usuário estivesse arrastando a barra
  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (hasMovedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      hasMovedRef.current = false;
    }
  }, []);

  return {
    containerRef,
    isDragging,
    tabScrollProps: {
      ref: containerRef,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseLeave,
      onWheel: handleWheel,
      onClickCapture: handleClickCapture,
      className: `overflow-x-auto no-scrollbar scroll-smooth select-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`
    }
  };
}
