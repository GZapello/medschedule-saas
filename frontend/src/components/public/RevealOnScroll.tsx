import React, { useEffect, useRef, useState } from 'react';

export interface RevealSectionProps {
  children: React.ReactNode;
  id?: string;
  className?: string;
}

/**
 * RevealSection:
 * Renderiza um elemento <section> sem sincronizar todos os filhos.
 * Cada RevealItem filho possui seu próprio IntersectionObserver independente.
 */
export const RevealSection: React.FC<RevealSectionProps> = ({
  children,
  id,
  className = ''
}) => {
  return (
    <section id={id} className={className}>
      {children}
    </section>
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
  autoAnimate?: boolean; // Usado no Hero para animar logo no carregamento inicial da página
  threshold?: number;
  rootMargin?: string;
}

/**
 * RevealItem:
 * - No Hero (autoAnimate=true): anima automaticamente em cascata no carregamento da página.
 * - Abaixo do Hero: cada RevealItem possui seu próprio IntersectionObserver.
 *   Permanece invisível (opacity 0 + translateY 45px) até que entre nos últimos 15–20% do viewport
 *   (threshold: 0.15, rootMargin: '0px 0px -12% 0px').
 *   Após surgir, desconecta o observer e nunca mais re-anima.
 */
export const RevealItem: React.FC<RevealItemProps> = ({
  children,
  className = '',
  delayMs = 0,
  durationMs = 650,
  direction = 'up',
  distancePx,
  scale = false,
  autoAnimate = false,
  threshold = 0.15,
  rootMargin = '0px 0px -12% 0px'
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const effectiveDistance = distancePx ?? (scale ? 40 : 45);

  useEffect(() => {
    // Respeito estrito a prefers-reduced-motion (WCAG)
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsVisible(true);
      return;
    }

    // Hero: animação automática no carregamento inicial
    if (autoAnimate) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 50);
      return () => clearTimeout(timer);
    }

    // Conteúdo abaixo do Hero: IntersectionObserver individual por elemento
    const el = itemRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [autoAnimate, threshold, rootMargin]);

  // Se o usuário tiver preferência ativa por redução de movimento, renderiza estático sem animação
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return (
      <div ref={itemRef} className={className}>
        {children}
      </div>
    );
  }

  const getTransform = () => {
    if (isVisible) {
      return scale ? 'translate3d(0, 0, 0) scale(1)' : 'translate3d(0, 0, 0)';
    }
    const scaleStr = scale ? ' scale(0.96)' : '';
    switch (direction) {
      case 'up':
        return `translate3d(0, ${effectiveDistance}px, 0)${scaleStr}`;
      case 'down':
        return `translate3d(0, -${effectiveDistance}px, 0)${scaleStr}`;
      case 'left':
        return `translate3d(${effectiveDistance}px, 0, 0)${scaleStr}`;
      case 'right':
        return `translate3d(-${effectiveDistance}px, 0, 0)${scaleStr}`;
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

// Alias de retrocompatibilidade
export const RevealOnScroll = RevealItem;
