import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface AnimatedStatProps {
  /** Valor final formatado do card, ex.: "+80%", "+70%", "-60%", "+75%" */
  value: string;
  /** Duração da animação em milissegundos (padrão: 1600ms) */
  durationMs?: number;
  /** Classe CSS preservando a identidade visual original */
  className?: string;
  /**
   * Controle externo opcional (ex.: quando a seção pai detecta entrada no viewport via IntersectionObserver).
   * Se não for informado, o próprio componente observa sua visibilidade no viewport.
   */
  active?: boolean;
  /** Threshold para o IntersectionObserver interno quando `active` não é fornecido */
  threshold?: number;
  /** rootMargin para o IntersectionObserver interno quando `active` não é fornecido */
  rootMargin?: string;
}

interface ParsedStat {
  sign: '+' | '-' | '';
  magnitude: number;
  signedTarget: number;
  decimals: number;
  decimalSeparator: '.' | ',';
  suffix: string;
}

function parseStatValue(raw: string): ParsedStat | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([+-]?)(\d+(?:[.,]\d+)?)(.*)$/);
  if (!match) return null;

  const sign = (match[1] as '+' | '-' | '') || '';
  const numericPart = match[2];
  const suffix = match[3] ?? '';

  const decimalSeparator: '.' | ',' = numericPart.includes(',') ? ',' : '.';
  const normalizedNumber = numericPart.replace(',', '.');
  const magnitude = Number.parseFloat(normalizedNumber);

  if (!Number.isFinite(magnitude)) return null;

  const decimalParts = normalizedNumber.split('.');
  const decimals = decimalParts.length > 1 ? decimalParts[1].length : 0;
  const signedTarget = sign === '-' ? -magnitude : magnitude;

  return {
    sign,
    magnitude,
    signedTarget,
    decimals,
    decimalSeparator,
    suffix
  };
}

function formatAnimatedStat(parsed: ParsedStat, currentSignedValue: number): string {
  const factor = Math.pow(10, parsed.decimals);
  const roundedSigned = Math.round(currentSignedValue * factor) / factor;
  const absValue = Math.abs(roundedSigned);

  const formattedNumber =
    parsed.decimals > 0
      ? absValue.toFixed(parsed.decimals).replace('.', parsed.decimalSeparator)
      : String(Math.round(absValue));

  // Mantém o sinal original (+ ou -) e o sufixo (%) durante toda a contagem
  return `${parsed.sign}${formattedNumber}${parsed.suffix}`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Easing suave ease-out cúbico */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export const AnimatedStat: React.FC<AnimatedStatProps> = ({
  value,
  durationMs = 1600,
  className = 'zl-result-impact',
  active,
  threshold = 0.2,
  rootMargin = '0px 0px -10% 0px'
}) => {
  const parsed = useMemo(() => parseStatValue(value), [value]);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => prefersReducedMotion());
  const [internalActive, setInternalActive] = useState<boolean>(false);

  const elementRef = useRef<HTMLElement>(null);
  const hasCompletedRef = useRef<boolean>(false);
  const lastRenderedRef = useRef<string>('');

  const initialDisplay = useMemo(() => {
    if (!parsed || reducedMotion) return value;
    return formatAnimatedStat(parsed, 0);
  }, [parsed, reducedMotion, value]);

  const [displayValue, setDisplayValue] = useState<string>(initialDisplay);

  // Sincroniza preferência de acessibilidade prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => {
      if (mediaQuery.matches) {
        setReducedMotion(true);
        hasCompletedRef.current = true;
        setDisplayValue(value);
      }
    };

    handleChange();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    return undefined;
  }, [value]);

  // Se `active` não for controlado pela seção pai, observa o próprio elemento via IntersectionObserver
  useEffect(() => {
    if (typeof active === 'boolean' || reducedMotion || hasCompletedRef.current) return;

    const el = elementRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInternalActive(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInternalActive(true);
          observer.unobserve(el);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [active, reducedMotion, threshold, rootMargin]);

  const shouldAnimate = typeof active === 'boolean' ? active : internalActive;

  // Executa a animação de count up / count down uma única vez com requestAnimationFrame
  useEffect(() => {
    if (!parsed) {
      setDisplayValue(value);
      return;
    }

    if (reducedMotion) {
      hasCompletedRef.current = true;
      setDisplayValue(value);
      return;
    }

    if (hasCompletedRef.current) {
      setDisplayValue(value);
      return;
    }

    if (!shouldAnimate) {
      const zeroFormatted = formatAnimatedStat(parsed, 0);
      lastRenderedRef.current = zeroFormatted;
      setDisplayValue(zeroFormatted);
      return;
    }

    let rafId = 0;
    let startTime: number | null = null;
    const safeDuration = Math.max(200, durationMs);

    const tick = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / safeDuration, 1);
      const easedProgress = easeOutCubic(progress);
      const currentSigned = parsed.signedTarget * easedProgress;

      if (progress < 1) {
        const nextFormatted = formatAnimatedStat(parsed, currentSigned);
        if (nextFormatted !== lastRenderedRef.current) {
          lastRenderedRef.current = nextFormatted;
          setDisplayValue(nextFormatted);
        }
        rafId = window.requestAnimationFrame(tick);
      } else {
        hasCompletedRef.current = true;
        lastRenderedRef.current = value;
        setDisplayValue(value);
      }
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [shouldAnimate, parsed, value, durationMs, reducedMotion]);

  return (
    <strong ref={elementRef} className={className} aria-label={value}>
      {displayValue}
    </strong>
  );
};

export const CountUpValue = AnimatedStat;
