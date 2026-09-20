import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

// Contexto para coordenar animações de elementos dentro de uma seção
interface SectionRevealContextType {
  isSectionRevealed: boolean;
}

const SectionRevealContext = createContext<SectionRevealContextType>({ isSectionRevealed: false });

export interface RevealSectionProps {
  children: React.ReactNode;
  id?: string;
  className?: string;
  threshold?: number; // 0.15 - 0.25 (padrão 0.18)
  rootMargin?: string; // padrão '0px 0px -60px 0px'
}

/**
 * RevealSection:
 * Observa quando aproximadamente 15–25% da seção entra no viewport.
 * Ao entrar, ativa em cascata/stagger os RevealItems pertencentes a essa seção.
 */
export const RevealSection: React.FC<RevealSectionProps> = ({
  children,
  id,
  className = '',
  threshold = 0.18,
  rootMargin = '0px 0px -60px 0px'
}) => {
  const [isSectionRevealed, setIsSectionRevealed] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Respeitar preferência do usuário por movimento reduzido (WCAG)
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mediaQuery.matches) {
        setIsSectionRevealed(true);
        return;
      }
      const handleChange = (e: MediaQueryListEvent) => {
        if (e.matches) setIsSectionRevealed(true);
      };
      mediaQuery.addEventListener?.('change', handleChange);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Dispara somente quando a seção atinge entre 15% e 25% de visibilidade real na tela
        if (entry.isIntersecting) {
          setIsSectionRevealed(true);
          if (sectionRef.current) {
            observer.unobserve(sectionRef.current);
          }
        }
      },
      {
        threshold,
        rootMargin
      }
    );

    const el = sectionRef.current;
    if (el) {
      observer.observe(el);
    }

    return () => {
      if (el) {
        observer.unobserve(el);
      }
    };
  }, [threshold, rootMargin]);

  return (
    <SectionRevealContext.Provider value={{ isSectionRevealed }}>
      <section ref={sectionRef} id={id} className={className}>
        {children}
      </section>
    </SectionRevealContext.Provider>
  );
};

export interface RevealItemProps {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
  durationMs?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  distancePx?: number;
  scale?: boolean;
  standalone?: boolean;
}

/**
 * RevealItem / RevealOnScroll:
 * Inicia aproximadamente 30–40px abaixo (padrão 36px) e opacity 0.
 * Quando a seção pai atinge o viewport (ou o próprio item atinge se for standalone),
 * sobe suavemente para a posição original + opacity 1, com suporte a stagger e scale.
 */
export const RevealItem: React.FC<RevealItemProps> = ({
  children,
  className = '',
  delayMs = 0,
  durationMs = 600,
  direction = 'up',
  distancePx = 36,
  scale = false,
  standalone = false
}) => {
  const { isSectionRevealed } = useContext(SectionRevealContext);
  const [selfRevealed, setSelfRevealed] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Se a seção pai já ativou e não é standalone forçado, não precisa de observer individual
    if (isSectionRevealed && !standalone) return;

    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mediaQuery.matches) {
        setSelfRevealed(true);
        return;
      }
      const handleChange = (e: MediaQueryListEvent) => {
        if (e.matches) setSelfRevealed(true);
      };
      mediaQuery.addEventListener?.('change', handleChange);
    }

    // Observer individual (para itens standalone ou fora de RevealSection)
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSelfRevealed(true);
          if (itemRef.current) {
            observer.unobserve(itemRef.current);
          }
        }
      },
      {
        threshold: 0.18,
        rootMargin: '0px 0px -50px 0px'
      }
    );

    const el = itemRef.current;
    if (el) {
      observer.observe(el);
    }

    return () => {
      if (el) {
        observer.unobserve(el);
      }
    };
  }, [isSectionRevealed, standalone]);

  const isVisible = isSectionRevealed || selfRevealed;

  const getTransform = () => {
    if (isVisible) {
      return scale ? 'translate3d(0, 0, 0) scale(1)' : 'translate3d(0, 0, 0)';
    }
    const scaleStr = scale ? ' scale(0.96)' : '';
    switch (direction) {
      case 'up':
        return `translate3d(0, ${distancePx}px, 0)${scaleStr}`;
      case 'down':
        return `translate3d(0, -${distancePx}px, 0)${scaleStr}`;
      case 'left':
        return `translate3d(${distancePx}px, 0, 0)${scaleStr}`;
      case 'right':
        return `translate3d(-${distancePx}px, 0, 0)${scaleStr}`;
      case 'none':
      default:
        return scale ? 'scale(0.96)' : 'none';
    }
  };

  return (
    <div
      ref={itemRef}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: getTransform(),
        transition: `opacity ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms, transform ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms`,
        willChange: isVisible ? 'auto' : 'opacity, transform'
      }}
    >
      {children}
    </div>
  );
};

// Compatibilidade retroativa
export const RevealOnScroll = RevealItem;

