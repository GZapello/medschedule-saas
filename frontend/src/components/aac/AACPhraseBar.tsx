import React, { useRef, useEffect } from 'react';
import { Volume2, Delete, Trash2, VolumeX, Sparkles } from 'lucide-react';
import { AACPhraseItem, FITZGERALD_COLORS } from './types';

interface AACPhraseBarProps {
  phrase: AACPhraseItem[];
  onRemoveLast: () => void;
  onClear: () => void;
  onSpeak: () => void;
  isSpeaking: boolean;
  speakOnClick: boolean;
  onToggleSpeakOnClick: () => void;
}

export const AACPhraseBar: React.FC<AACPhraseBarProps> = ({
  phrase,
  onRemoveLast,
  onClear,
  onSpeak,
  isSpeaking,
  speakOnClick,
  onToggleSpeakOnClick
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para a direita quando um novo cartão é inserido
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = containerRef.current.scrollWidth;
    }
  }, [phrase.length]);

  return (
    <div className="bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 py-2 sm:px-4 sm:py-2.5 shrink-0 z-30 shadow-2xs">
      <div className="flex flex-row items-center gap-2 sm:gap-3">
        {/* Faixa horizontal de Frase */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center gap-1.5 p-1.5 bg-slate-50 border border-slate-300 rounded-xl min-h-[46px] sm:min-h-[50px] overflow-x-auto scroll-smooth focus:outline-hidden"
          role="region"
          aria-label="Faixa de construção da frase"
        >
          {phrase.length === 0 ? (
            <div className="flex items-center gap-2 px-2 text-slate-400 text-xs select-none italic font-medium">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>Clique nos cartões para formar a frase do paciente…</span>
            </div>
          ) : (
            phrase.map((item, idx) => {
              const meta = FITZGERALD_COLORS[item.category] || FITZGERALD_COLORS.descriptor;
              return (
                <div
                  key={`${item.id}-${idx}`}
                  style={{
                    backgroundColor: item.color || meta.bg,
                    borderColor: meta.border,
                    color: meta.text
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-2xs shrink-0 transition-transform animate-in fade-in zoom-in-95 duration-150"
                >
                  {item.symbol_type === 'image' && item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.label}
                      className="w-6 h-6 rounded-md object-cover bg-white shrink-0"
                    />
                  ) : (
                    <span className="text-lg sm:text-xl select-none leading-none shrink-0" role="img" aria-hidden="true">
                      {item.image_url || '💬'}
                    </span>
                  )}
                  <span className="text-xs sm:text-sm font-black whitespace-nowrap">
                    {item.label}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Botões de Ação da Faixa de Frase */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 justify-end">
          {/* Falar Frase Completa */}
          <button
            type="button"
            onClick={onSpeak}
            disabled={phrase.length === 0 || isSpeaking}
            className={`inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl font-black text-xs sm:text-sm shadow-sm transition-all cursor-pointer ${
              phrase.length === 0
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : isSpeaking
                ? 'bg-amber-500 text-white animate-pulse ring-2 ring-amber-200'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md active:scale-95'
            }`}
            title="Reproduzir frase por síntese de voz (Web Speech)"
          >
            <Volume2 className={`w-4 h-4 ${isSpeaking ? 'animate-bounce' : ''}`} />
            <span>{isSpeaking ? 'Falando…' : 'Falar'}</span>
          </button>

          {/* Apagar último */}
          <button
            type="button"
            onClick={onRemoveLast}
            disabled={phrase.length === 0}
            className="p-2 sm:p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Apagar último cartão adicionado"
            aria-label="Apagar último"
          >
            <Delete className="w-4 h-4 text-slate-600" />
          </button>

          {/* Limpar tudo */}
          <button
            type="button"
            onClick={onClear}
            disabled={phrase.length === 0}
            className="p-2 sm:p-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 disabled:opacity-40 disabled:hover:bg-rose-50 transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Limpar toda a frase"
            aria-label="Limpar frase"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Alternar som no clique */}
          <button
            type="button"
            onClick={onToggleSpeakOnClick}
            className={`p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${
              speakOnClick
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
            title={speakOnClick ? 'Som ao tocar no cartão: ATIVADO' : 'Som ao tocar no cartão: DESATIVADO'}
          >
            {speakOnClick ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
