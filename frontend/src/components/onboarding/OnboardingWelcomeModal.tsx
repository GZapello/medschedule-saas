import React from 'react';
import { useOnboarding } from './OnboardingContext';
import { Sparkles, Compass, X, ArrowRight } from 'lucide-react';

export const OnboardingWelcomeModal: React.FC = () => {
  const {
    isWelcomeModalOpen,
    startTour,
    skipTour,
    dismissPermanently
  } = useOnboarding();

  if (!isWelcomeModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 sm:p-7 flex flex-col gap-5 animate-in zoom-in-95 duration-200 relative overflow-hidden">
        {/* Glow decorativo de fundo */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header com ícone e botão fechar */}
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white flex items-center justify-center shadow-lg shadow-teal-600/20">
            <Compass className="w-6 h-6" />
          </div>

          <button
            onClick={skipTour}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Fechar modal de boas-vindas"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Título e Texto objetivos conforme especificação */}
        <div>
          <h2
            id="welcome-modal-title"
            className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-snug"
          >
            Quer conhecer o Zemda em poucos minutos?
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mt-2">
            Faça um tour rápido pelas principais funções da sua rotina. Você pode pular agora e retomar quando quiser.
          </p>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-col gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => startTour()}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-teal-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Começar guia</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={skipTour}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
          >
            Pular por agora
          </button>

          <button
            type="button"
            onClick={dismissPermanently}
            className="w-full py-1.5 text-center text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            Não mostrar novamente
          </button>
        </div>
      </div>
    </div>
  );
};
