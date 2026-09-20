import React, { useEffect, useRef, useState } from 'react';

interface RevealOnScrollProps {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  scale?: boolean;
  durationMs?: number;
}

export const RevealOnScroll: React.FC<RevealOnScrollProps> = ({
  children,
  className = '',
  delayMs = 0,
  direction = 'up',
  scale = false,
  durationMs = 600
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Respeitar preferência do usuário por movimento reduzido (Acessibilidade WCAG)
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mediaQuery.matches) {
        setIsVisible(true);
        return;
      }
      const handleChange = (e: MediaQueryListEvent) => {
        if (e.matches) setIsVisible(true);
      };
      mediaQuery.addEventListener?.('change', handleChange);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (ref.current) {
            observer.unobserve(ref.current);
          }
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
      }
    );

    const currentEl = ref.current;
    if (currentEl) {
      observer.observe(currentEl);
    }

    return () => {
      if (currentEl) {
        observer.unobserve(currentEl);
      }
    };
  }, []);

  const getTransform = () => {
    if (isVisible) {
      return scale ? 'translate3d(0, 0, 0) scale(1)' : 'translate3d(0, 0, 0)';
    }
    const scaleStr = scale ? ' scale(0.97)' : '';
    switch (direction) {
      case 'up':
        return `translate3d(0, 22px, 0)${scaleStr}`;
      case 'down':
        return `translate3d(0, -22px, 0)${scaleStr}`;
      case 'left':
        return `translate3d(22px, 0, 0)${scaleStr}`;
      case 'right':
        return `translate3d(-22px, 0, 0)${scaleStr}`;
      case 'none':
      default:
        return scale ? 'scale(0.97)' : 'none';
    }
  };

  return (
    <div
      ref={ref}
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
