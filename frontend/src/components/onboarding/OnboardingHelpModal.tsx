import React, { useState } from 'react';
import { useOnboarding } from './OnboardingContext';
import {
  HelpCircle,
  Compass,
  Sparkles,
  Layers,
  Keyboard,
  LifeBuoy,
  X,
  ChevronRight,
  CheckCircle2,
  ArrowLeft
} from 'lucide-react';

export const OnboardingHelpModal: React.FC = () => {
  const {
    isHelpOpen,
    closeHelp,
    startTour,
    startModuleTour,
    openWhatsNew,
    openShortcuts,
    availableModules,
    onboardingData
  } = useOnboarding();

  const [selectingModule, setSelectingModule] = useState<boolean>(false);

  if (!isHelpOpen) return null;

  const handleModuleClick = () => {
    if (availableModules.length === 1) {
      startModuleTour(availableModules[0].id);
      closeHelp();
    } else if (availableModules.length > 1) {
      setSelectingModule(true);
    } else {
      startTour();
    }
  };

  const handleSupportClick = () => {
    closeHelp();
    window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'support-tickets' } }));
  };

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200 relative">
        {/* Header do Menu de Ajuda */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            {selectingModule && (
              <button
                type="button"
                onClick={() => setSelectingModule(false)}
                className="p-1 -ml-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Voltar"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 id="help-modal-title" className="text-sm font-bold text-slate-900 leading-tight">
                {selectingModule ? 'Qual módulo deseja conhecer?' : 'Central de Ajuda Zemda'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {selectingModule ? 'Selecione o módulo para iniciar o tour' : 'Tours guiados, novidades e suporte rápido'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setSelectingModule(false);
              closeHelp();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Fechar Central de Ajuda"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Seleção de Módulo Específico */}
        {selectingModule ? (
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
            {availableModules.map(mod => {
              const isCompleted = onboardingData.moduleToursCompleted.includes(mod.id);
              return (
                <button
                  key={mod.id}
                  onClick={() => {
                    setSelectingModule(false);
                    startModuleTour(mod.id);
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-teal-50 hover:border-teal-200 transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 group-hover:border-teal-300 flex items-center justify-center text-teal-600 shadow-2xs">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800 group-hover:text-teal-900 block">
                        {mod.name}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {isCompleted ? 'Concluído anteriormente' : 'Tour especializado do módulo'}
                      </span>
                    </div>
                  </div>

                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          /* Lista Principal de Opções da Central de Ajuda */
          <div className="flex flex-col gap-2">
            {/* 1. Fazer tour do Zemda */}
            <button
              type="button"
              onClick={() => {
                closeHelp();
                startTour();
              }}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-teal-50 hover:border-teal-200 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white flex items-center justify-center shadow-xs">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-teal-900 block">
                    Fazer tour do Zemda
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Revisar as principais funções da sua rotina
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 shrink-0" />
            </button>

            {/* 2. Conhecer meu módulo */}
            <button
              type="button"
              onClick={handleModuleClick}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-teal-50 hover:border-teal-200 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shadow-xs">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-sky-900 block">
                    Conhecer meu módulo
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {availableModules.length > 1
                      ? 'Escolha entre seus módulos profissionais'
                      : 'Tour específico do seu ambiente clínico'}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-sky-600 shrink-0" />
            </button>

            {/* 3. Ver novidades */}
            <button
              type="button"
              onClick={() => {
                closeHelp();
                openWhatsNew();
              }}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-amber-50 hover:border-amber-200 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 group-hover:text-amber-900 block">
                      Ver novidades
                    </span>
                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      Atualizado
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Recursos recentes lançados no Zemda
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 shrink-0" />
            </button>

            {/* 4. Atalhos de Teclado */}
            <button
              type="button"
              onClick={() => {
                closeHelp();
                openShortcuts();
              }}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-200 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shadow-xs">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-slate-900 block">
                    Atalhos de teclado
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Navegação rápida e atalhos de rotina
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 shrink-0" />
            </button>

            {/* 5. Central de Suporte */}
            <button
              type="button"
              onClick={handleSupportClick}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-teal-50 hover:border-teal-200 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shadow-xs">
                  <LifeBuoy className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-teal-900 block">
                    Central de suporte
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Abra chamados ou tire dúvidas com nossa equipe
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 shrink-0" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
