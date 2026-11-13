import { usePersonalMobileViewport } from '../../hooks/usePersonalMobileViewport';
import React from 'react';
import { X, ExternalLink, Play, AlertCircle } from 'lucide-react';
import { parseExternalVideoUrl } from './videoUtils';

interface PersonalVideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string | null | undefined;
  exerciseName: string;
}

export const PersonalVideoPlayerModal: React.FC<PersonalVideoPlayerModalProps> = ({
  isOpen,
  onClose,
  videoUrl,
  exerciseName
}) => {
  const mobileViewportRef = usePersonalMobileViewport(isOpen);

  if (!isOpen || !videoUrl) return null;

  const parsed = parseExternalVideoUrl(videoUrl);

  return (
    <div
      ref={mobileViewportRef} data-personal-mobile="video" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-modal-title"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] animate-scaleUp"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center space-x-3 min-w-0 pr-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h3 id="video-modal-title" className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">
                  {exerciseName}
                </h3>
                {parsed && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                    {parsed.label}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Demonstração externa do exercício
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Fechar"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Player Area */}
        <div className="p-4 sm:p-6 bg-slate-950 flex flex-col items-center justify-center">
          {parsed?.isEmbeddable && parsed.embedUrl ? (
            <div className="w-full aspect-video rounded-xl overflow-hidden bg-black shadow-inner relative">
              <iframe
                src={parsed.embedUrl}
                title={`Demonstração de ${exerciseName}`}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="w-full py-12 px-6 flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h4 className="text-base font-semibold text-white mb-2">
                Reprodução incorporada não disponível
              </h4>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Este link externo pode ter restrições de incorporação ou não permitir exibição embutida no aplicativo. Você pode assisti-lo diretamente na plataforma de origem.
              </p>
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.02]"
              >
                <span>Abrir vídeo original</span>
                <ExternalLink className="w-4 h-4 ml-1" />
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate pr-4 max-w-sm hidden sm:inline" title={videoUrl}>
            Fonte externa: {videoUrl}
          </span>
          <div className="flex items-center space-x-3 ml-auto">
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium hover:underline"
            >
              <span>Abrir na plataforma ({parsed?.label || 'Link'})</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
