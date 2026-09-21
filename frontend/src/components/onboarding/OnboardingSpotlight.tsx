import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOnboarding } from './OnboardingContext';
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  HelpCircle
} from 'lucide-react';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export const OnboardingSpotlight: React.FC = () => {
  const {
    isTourActive,
    currentTour,
    currentStepIndex,
    currentStep,
    nextStep,
    prevStep,
    skipTour,
    finishTour
  } = useOnboarding();

  const [rect, setRect] = useState<TargetRect | null>(null);
  const [targetFound, setTargetFound] = useState<boolean>(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number }>({ top: 100, left: 100 });

  // Localiza e mede o elemento alvo na tela
  const updatePosition = useCallback(() => {
    if (!isTourActive || !currentStep) {
      setRect(null);
      return;
    }

    let el = document.querySelector(currentStep.target) as HTMLElement | null;

    // Fallback: se o seletor principal não for encontrado e for um item do sidebar, tenta alternativas
    if (!el && currentStep.target.includes('nav-')) {
      const navId = currentStep.target.replace(/\[data-tour="nav-([^"]+)"\]/, '$1');
      el = document.querySelector(`button[data-nav-id="${navId}"]`) ||
           document.querySelector(`aside button:has(svg)`) as HTMLElement | null;
    }

    if (!el) {
      setTargetFound(false);
      setRect(null);
      return;
    }

    setTargetFound(true);
    const r = el.getBoundingClientRect();

    // Rola a tela suavemente até o elemento caso esteja fora do viewport visível
    const isOutOfViewport = r.top < 60 || r.bottom > window.innerHeight - 60 || r.left < 0 || r.right > window.innerWidth;
    if (isOutOfViewport) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }

    const padding = 6;
    const computedRect: TargetRect = {
      top: Math.max(0, r.top - padding),
      left: Math.max(0, r.left - padding),
      width: r.width + padding * 2,
      height: r.height + padding * 2,
      bottom: r.bottom + padding,
      right: r.right + padding
    };
    setRect(computedRect);

    // Calcula posição inteligente do card
    const cardWidth = Math.min(360, window.innerWidth - 32);
    const cardHeight = 220;
    const margin = 12;

    let top = 100;
    let left = 100;
    const preferredPos = currentStep.position || 'auto';

    if (preferredPos === 'right' && computedRect.right + cardWidth + margin < window.innerWidth) {
      left = computedRect.right + margin;
      top = computedRect.top + (computedRect.height / 2) - (cardHeight / 2);
    } else if (preferredPos === 'left' && computedRect.left - cardWidth - margin > 0) {
      left = computedRect.left - cardWidth - margin;
      top = computedRect.top + (computedRect.height / 2) - (cardHeight / 2);
    } else if (preferredPos === 'top' && computedRect.top - cardHeight - margin > 0) {
      top = computedRect.top - cardHeight - margin;
      left = computedRect.left + (computedRect.width / 2) - (cardWidth / 2);
    } else {
      // Padrão: abaixo do elemento
      if (computedRect.bottom + cardHeight + margin < window.innerHeight) {
        top = computedRect.bottom + margin;
        left = computedRect.left + (computedRect.width / 2) - (cardWidth / 2);
      } else if (computedRect.top - cardHeight - margin > 0) {
        top = computedRect.top - cardHeight - margin;
        left = computedRect.left + (computedRect.width / 2) - (cardWidth / 2);
      } else {
        // Centralizado verticalmente ao lado
        top = Math.max(16, (window.innerHeight - cardHeight) / 2);
        left = Math.max(16, (window.innerWidth - cardWidth) / 2);
      }
    }

    // Clamping para não vazar a viewport em qualquer resolução
    left = Math.max(16, Math.min(left, window.innerWidth - cardWidth - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - cardHeight - 16));

    setCardPos({ top, left });
  }, [isTourActive, currentStep]);

  useEffect(() => {
    updatePosition();
    const handleResize = () => updatePosition();
    const handleScroll = () => updatePosition();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    // Timeout de reavaliação após animação de transição de tela
    const timer = setTimeout(updatePosition, 180);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      clearTimeout(timer);
    };
  }, [updatePosition, currentStepIndex]);

  // Navegação por teclado acessível
  useEffect(() => {
    if (!isTourActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTourActive, nextStep, prevStep]);

  if (!isTourActive || !currentTour || !currentStep) return null;

  const totalSteps = currentTour.steps.length;
  const isLastStep = currentStepIndex === totalSteps - 1;
  const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9998]" aria-live="polite">
      {/* 1. MÁSCARA DE SPOTLIGHT AO REDOR DO ELEMENTO REAL */}
      {rect && targetFound ? (
        <div
          style={{
            position: 'fixed',
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            borderRadius: '16px',
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
            border: '2px solid #0d9488',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          className="pointer-events-none ring-4 ring-teal-500/20"
        />
      ) : (
        // Se o elemento não estiver renderizado no DOM neste momento, escurece suavemente
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200" />
      )}

      {/* 2. CARD INFORMATIVO COMPACTO E RESPONSIVO */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label={currentStep.title}
        style={{
          position: 'fixed',
          top: `${cardPos.top}px`,
          left: `${cardPos.left}px`,
          width: '360px',
          maxWidth: 'calc(100vw - 32px)'
        }}
        className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-teal-100 p-5 z-[9999] flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header do Card com Passo e Botão Fechar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
              <Sparkles className="w-3 h-3 text-teal-600" />
              Passo {currentStepIndex + 1} de {totalSteps}
            </span>
          </div>

          <button
            onClick={skipTour}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Fechar guia (ESC)"
            aria-label="Fechar guia"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo textual */}
        <div>
          <h3 className="text-sm font-bold text-slate-900 leading-snug">
            {currentStep.title}
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed mt-1">
            {currentStep.description}
          </p>
        </div>

        {/* Barra de Progresso Visual */}
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Rodapé com Ações */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={skipTour}
            className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            Pular tour
          </button>

          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                title="Voltar ao passo anterior (Seta esquerda)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Anterior</span>
              </button>
            )}

            <button
              type="button"
              onClick={isLastStep ? finishTour : nextStep}
              className={`flex items-center gap-1 px-4 py-1.5 text-xs font-bold text-white rounded-xl shadow-xs transition-all cursor-pointer ${
                isLastStep
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/20'
                  : 'bg-teal-600 hover:bg-teal-700'
              }`}
              title={isLastStep ? 'Concluir tour' : 'Avançar (Enter ou Seta direita)'}
            >
              {isLastStep ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Finalizar</span>
                </>
              ) : (
                <>
                  <span>Próximo</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
