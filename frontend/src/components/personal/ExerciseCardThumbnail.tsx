import React, { useState, useEffect, useRef } from 'react';
import { ZoomIn, Play, Pause, Film } from 'lucide-react';
import { SecureFileImage } from '../common/SecureFileImage';
import { Exercise } from './types';

interface ExerciseCardThumbnailProps {
  exercise: Exercise;
  onZoom: () => void;
  isInactive?: boolean;
  active: boolean;
  onActiveChange: (active: boolean) => void;
}

export const ExerciseCardThumbnail: React.FC<ExerciseCardThumbnailProps> = ({
  exercise,
  onZoom,
  isInactive = false,
  active,
  onActiveChange
}) => {
  const [gifFailed, setGifFailed] = useState(false);
  const [gifReady, setGifReady] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const changeRef = useRef(onActiveChange);
  changeRef.current = onActiveChange;
  const hasGif = Boolean(exercise.gif_url && !gifFailed);
  const isPlaying = active && hasGif;

  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => { setCanHover(query.matches); changeRef.current(false); };
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => { setGifFailed(false); setGifReady(false); changeRef.current(false); }, [exercise.gif_url]);
  useEffect(() => { if (!isPlaying) setGifReady(false); }, [isPlaying]);
  useEffect(() => {
    if (!isPlaying) return;
    const stopWhenHidden = () => { if (document.hidden) changeRef.current(false); };
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) changeRef.current(false);
    });
    if (host.current) observer.observe(host.current);
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', stopWhenHidden); };
  }, [isPlaying]);

  return (
    <div
      ref={host}
      data-exercise-thumbnail={exercise.id}
      onClick={onZoom}
      onPointerEnter={event => { if (event.pointerType === 'mouse' && canHover && hasGif) onActiveChange(true); }}
      onPointerLeave={event => { if (event.pointerType === 'mouse' && canHover) onActiveChange(false); }}
      tabIndex={0}
      role="button"
      aria-label={`Ver detalhes de ${exercise.name}`}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onZoom();
        }
      }}
      className="relative w-full h-36 bg-slate-100 rounded-xl overflow-hidden mb-3 flex items-center justify-center border border-slate-100 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
    >
      <div className={`w-full h-full ${isPlaying && gifReady ? 'invisible' : ''}`}>
        <SecureFileImage
          lazy
          fileId={exercise.exercise_file_id}
          fallbackUrl={exercise.photo_url}
          alt={exercise.name}
          className={`w-full h-full ${exercise.photo_url?.startsWith('/exercise-media/') ? 'object-contain' : 'object-cover'}`}
        />
      </div>
      {isPlaying && <img
        src={exercise.gif_url}
        alt={`Demonstração animada: ${exercise.name}`}
        className={`absolute inset-0 w-full h-full object-contain bg-white ${gifReady ? '' : 'opacity-0'}`}
        onLoad={() => setGifReady(true)}
        onError={() => { setGifFailed(true); setGifReady(false); onActiveChange(false); }}
      />}

      {/* Botão de Zoom no canto superior direito */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onZoom();
        }}
        title="Ampliar visualização e foto"
        aria-label="Ampliar visualização e foto"
        className="absolute top-2 right-2 p-1.5 bg-slate-900/60 hover:bg-slate-900 text-white rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity backdrop-blur-xs z-10"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>

      {/* Indicador discreto para desktop: "Passe o mouse para ver o movimento" */}
      {hasGif && canHover && (
        <div className="flex absolute bottom-2 right-2 items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-900/70 text-slate-100 text-[9px] font-medium backdrop-blur-xs pointer-events-none transition-opacity z-10 shadow-xs">
          {isPlaying ? (
            <span className="flex items-center gap-1 text-indigo-300 font-semibold animate-pulse">
              <Film className="w-3 h-3" /> Movimento
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-300">
              <Film className="w-3 h-3" /> Passe o mouse para ver o movimento
            </span>
          )}
        </div>
      )}

      {/* Botão pequeno para mobile/touch: "Ver movimento" / "Pausar" */}
      {hasGif && !canHover && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onActiveChange(!isPlaying);
          }}
          aria-pressed={isPlaying}
          title={isPlaying ? 'Voltar à imagem' : 'Ver movimento'}
          aria-label={isPlaying ? 'Voltar à imagem' : 'Ver movimento'}
          className="absolute bottom-2 right-2 px-2 py-0.5 bg-slate-900/80 hover:bg-slate-900 active:bg-slate-950 text-white rounded-md text-[10px] font-medium flex items-center gap-1 backdrop-blur-xs z-10 shadow-xs transition-colors"
        >
          {isPlaying ? (
            <>
              <Pause className="w-3 h-3 text-indigo-300" />
              <span>Voltar à imagem</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 text-indigo-300" />
              <span>Ver movimento</span>
            </>
          )}
        </button>
      )}

      {/* Badges de status no canto inferior esquerdo */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 z-10 pointer-events-none">
        {exercise.is_custom === 1 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-indigo-600/90 text-white rounded-md backdrop-blur-xs">
            Customizado
          </span>
        )}
        {!exercise.exercise_file_id && exercise.photo_url?.startsWith('/exercise-fallbacks/') && (
          <span className="text-[9px] bg-slate-900/80 text-white rounded px-1.5">
            Ilustração de referência
          </span>
        )}
        {isInactive && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-600/90 text-white rounded-md backdrop-blur-xs">
            Inativo
          </span>
        )}
      </div>
    </div>
  );
};
