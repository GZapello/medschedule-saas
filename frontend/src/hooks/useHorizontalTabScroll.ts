import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface HorizontalTabScrollReturn<T extends HTMLElement = HTMLDivElement> {
  containerRef: React.RefObject<T>;
  isDragging: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  scrollLeft: (amount?: number) => void;
  scrollRight: (amount?: number) => void;
  checkScrollLimits: () => void;
  tabScrollProps: {
    ref: React.RefObject<T>;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onWheel: (e: React.WheelEvent) => void;
    onClickCapture: (e: React.MouseEvent) => void;
    onScroll: () => void;
    className: string;
  };
}

/**
 * Hook universal de controle de usabilidade em barras horizontais de abas:
 * - Rolagem suave automática para a aba ativa (scrollIntoView)
 * - Detecção contínua de limites de scroll (canScrollLeft / canScrollRight)
 * - Navegação via botões laterais (scrollLeft / scrollRight com behavior: smooth)
 * - Atualização responsiva em scroll, resize, activeTab e mutações de DOM
 * - Arraste com mouse (drag-to-scroll)
 * - Rolagem horizontal com roda do mouse (converte wheel deltaY em scrollLeft)
 * - Prevenção de clique acidental durante o arraste
 */
export function useHorizontalTabScroll<T extends HTMLElement = HTMLDivElement>(
  activeTabKey?: string | number
): HorizontalTabScrollReturn<T> {
  const containerRef = useRef<T>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Calcula com tolerância de subpixel se há conteúdo fora do campo visível à esquerda ou à direita
  const checkScrollLimits = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const currentScrollLeft = el.scrollLeft;
    const maxScroll = el.scrollWidth - el.clientWidth;

    // Tolerância de 2px para evitar oscilações em telas de alta densidade/zoom
    const nextCanScrollLeft = currentScrollLeft > 2;
    const nextCanScrollRight = maxScroll > 2 && currentScrollLeft < maxScroll - 2;

    setCanScrollLeft(nextCanScrollLeft);
    setCanScrollRight(nextCanScrollRight);
  }, []);

  // Desloca a barra horizontalmente de forma suave (250-350px por clique)
  const scrollBy = useCallback(
    (offset: number) => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollBy({
        left: offset,
        behavior: 'smooth'
      });
      // Verifica os limites nos checkpoints de animação
      setTimeout(checkScrollLimits, 150);
      setTimeout(checkScrollLimits, 350);
      setTimeout(checkScrollLimits, 500);
    },
    [checkScrollLimits]
  );

  const scrollLeft = useCallback(
    (amount: number = 300) => {
      scrollBy(-amount);
    },
    [scrollBy]
  );

  const scrollRight = useCallback(
    (amount: number = 300) => {
      scrollBy(amount);
    },
    [scrollBy]
  );

  // Listener nativo de scroll + sincronização contínua
  const handleScroll = useCallback(() => {
    checkScrollLimits();
  }, [checkScrollLimits]);

  // Rola suavemente a aba ativa para o campo de visão quando o activeTabKey mudar
  useEffect(() => {
    if (!containerRef.current || activeTabKey === undefined) {
      checkScrollLimits();
      return;
    }

    const timer = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;

      const activeEl = el.querySelector<HTMLElement>(
        '[data-active="true"], [data-active=true], [aria-selected="true"]'
      );
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
        setTimeout(checkScrollLimits, 200);
        setTimeout(checkScrollLimits, 450);
      } else {
        checkScrollLimits();
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [activeTabKey, checkScrollLimits]);

  // Observa redimensionamento de janela, ResizeObserver no container e mutações nas abas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkScrollLimits();

    const handleWindowResize = () => {
      checkScrollLimits();
    };
    window.addEventListener('resize', handleWindowResize, { passive: true });

    // Listener nativo no elemento para garantir captura imediata de qualquer movimento
    el.addEventListener('scroll', handleScroll, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        checkScrollLimits();
      });
      resizeObserver.observe(el);
      if (el.firstElementChild) {
        resizeObserver.observe(el.firstElementChild);
      }
    }

    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        checkScrollLimits();
      });
      mutationObserver.observe(el, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      el.removeEventListener('scroll', handleScroll);
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
    };
  }, [checkScrollLimits, handleScroll]);

  // Início do arraste pelo ponteiro do mouse (mouse drag)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
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
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    checkScrollLimits,
    tabScrollProps: {
      ref: containerRef,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseLeave,
      onWheel: handleWheel,
      onClickCapture: handleClickCapture,
      onScroll: handleScroll,
      className: `overflow-x-auto no-scrollbar scroll-smooth select-none px-8 sm:px-10 ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`
    }
  };
}

export interface HorizontalTabNavProps {
  scroll: {
    canScrollLeft: boolean;
    canScrollRight: boolean;
    scrollLeft: (amount?: number) => void;
    scrollRight: (amount?: number) => void;
  };
  children: React.ReactNode;
  className?: string;
  bgTheme?: 'white' | 'slate-50' | 'slate-100' | 'dark' | 'transparent';
  customGradientFrom?: string;
  customGradientTo?: string;
  fadeWidthClass?: string;
  scrollAmount?: number;
  leftArrowLabel?: string;
  rightArrowLabel?: string;
}

/**
 * Componente visual unificado para barras de abas horizontais:
 * - Botão ← fixo à esquerda (visível apenas quando houver abas ocultas à esquerda)
 * - Fade gradiente discreto à esquerda indicando continuidade
 * - Botão → fixo à direita (visível apenas quando houver abas ocultas à direita)
 * - Fade gradiente discreto à direita indicando continuidade
 * - Suporta navegação por teclado e acessibilidade via aria-label
 */
export const HorizontalTabNav: React.FC<HorizontalTabNavProps> = ({
  scroll,
  children,
  className = '',
  bgTheme = 'white',
  customGradientFrom,
  customGradientTo,
  fadeWidthClass = 'w-10 sm:w-14',
  scrollAmount = 300,
  leftArrowLabel = 'Ver abas anteriores',
  rightArrowLabel = 'Ver próximas abas'
}) => {
  const { canScrollLeft, canScrollRight, scrollLeft, scrollRight } = scroll;

  const gradientFrom =
    customGradientFrom ||
    (bgTheme === 'slate-50'
      ? 'from-slate-50 via-slate-50/80 to-transparent'
      : bgTheme === 'slate-100'
      ? 'from-slate-100 via-slate-100/80 to-transparent'
      : bgTheme === 'dark' || bgTheme === 'transparent'
      ? 'from-slate-900 via-slate-900/80 to-transparent'
      : 'from-white via-white/80 to-transparent');

  const gradientTo =
    customGradientTo ||
    (bgTheme === 'slate-50'
      ? 'from-slate-50 via-slate-50/80 to-transparent'
      : bgTheme === 'slate-100'
      ? 'from-slate-100 via-slate-100/80 to-transparent'
      : bgTheme === 'dark' || bgTheme === 'transparent'
      ? 'from-slate-900 via-slate-900/80 to-transparent'
      : 'from-white via-white/80 to-transparent');

  const buttonStyle =
    bgTheme === 'dark' || bgTheme === 'transparent'
      ? 'bg-slate-800/95 hover:bg-slate-800 text-slate-200 hover:text-white border-slate-700'
      : 'bg-white/95 hover:bg-white text-slate-600 hover:text-slate-900 border-slate-200/90';

  const leftElements = canScrollLeft
    ? [
        React.createElement('div', {
          key: 'fade-left',
          className: `pointer-events-none absolute left-0 top-0 bottom-0 ${fadeWidthClass} z-10 bg-gradient-to-r ${gradientFrom} transition-opacity duration-300`,
          'aria-hidden': 'true'
        }),
        React.createElement(
          'div',
          {
            key: 'btn-left',
            className: 'absolute left-1.5 sm:left-2 top-1/2 -translate-y-1/2 z-20 flex items-center'
          },
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: () => scrollLeft(scrollAmount),
              'aria-label': leftArrowLabel,
              className: `w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full border shadow-xs hover:shadow-md transition-all active:scale-95 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${buttonStyle}`
            },
            React.createElement(ChevronLeft, { className: 'w-4 h-4 sm:w-4.5 sm:h-4.5' })
          )
        )
      ]
    : null;

  const rightElements = canScrollRight
    ? [
        React.createElement('div', {
          key: 'fade-right',
          className: `pointer-events-none absolute right-0 top-0 bottom-0 ${fadeWidthClass} z-10 bg-gradient-to-l ${gradientTo} transition-opacity duration-300`,
          'aria-hidden': 'true'
        }),
        React.createElement(
          'div',
          {
            key: 'btn-right',
            className: 'absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 z-20 flex items-center'
          },
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: () => scrollRight(scrollAmount),
              'aria-label': rightArrowLabel,
              className: `w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full border shadow-xs hover:shadow-md transition-all active:scale-95 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${buttonStyle}`
            },
            React.createElement(ChevronRight, { className: 'w-4 h-4 sm:w-4.5 sm:h-4.5' })
          )
        )
      ]
    : null;

  return React.createElement(
    'div',
    { className: `relative w-full min-w-0 ${className}` },
    leftElements,
    children,
    rightElements
  );
};

// Alias conveniente
export const ScrollableTabNav = HorizontalTabNav;
