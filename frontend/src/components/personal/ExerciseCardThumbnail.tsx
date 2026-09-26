import React, { useState } from 'react';
import { ZoomIn, Play, Pause, Film } from 'lucide-react';
import { SecureFileImage } from '../common/SecureFileImage';
import { Exercise } from './types';

interface ExerciseCardThumbnailProps {
  exercise: Exercise;
  onZoom: () => void;
  isInactive?: boolean;
}

export const ExerciseCardThumbnail: React.FC<ExerciseCardThumbnailProps> = ({
  exercise,
  onZoom,
  isInactive = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isTouchActive, setIsTouchActive] = useState(false);
  const [gifFailed, setGifFailed] = useState(false);

  const hasGif = Boolean(exercise.gif_url && !gifFailed);
  const isPlaying = hasGif && (isHovered || isTouchActive);

  return (
    <div
      onClick={onZoom}
      onMouseEnter={() => hasGif && setIsHovered(true)}
      onMouseLeave={() => hasGif && setIsHovered(false)}
      onFocus={() => hasGif && setIsHovered(true)}
      onBlur={() => hasGif && setIsHovered(false)}
      tabIndex={0}
      role="button"
      aria-label={`Ver detalhes de ${exercise.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onZoom();
        }
      }}
      className="relative w-full h-36 bg-slate-100 rounded-xl overflow-hidden mb-3 flex items-center justify-center border border-slate-100 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
    >
      {isPlaying ? (
        <img
          src={exercise.gif_url}
          alt={`Demonstração animada: ${exercise.name}`}
          className="w-full h-full object-contain bg-white"
          onError={() => {
            setGifFailed(true);
            setIsHovered(false);
            setIsTouchActive(false);
          }}
        />
      ) : (
        <SecureFileImage
          lazy
          fileId={exercise.exercise_file_id}
          fallbackUrl={exercise.photo_url}
          alt={exercise.name}
          className={`w-full h-full ${
            exercise.photo_url?.startsWith('/exercise-media/') ? 'object-contain' : 'object-cover'
          } group-hover:scale-105 transition-transform duration-300`}
        />
      )}

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
      {hasGif && (
        <div className="hidden sm:flex absolute bottom-2 right-2 items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-900/70 text-slate-100 text-[9px] font-medium backdrop-blur-xs pointer-events-none transition-opacity z-10 shadow-xs">
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
      {hasGif && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsTouchActive((prev) => !prev);
          }}
          title={isTouchActive ? 'Pausar movimento' : 'Ver movimento'}
          aria-label={isTouchActive ? 'Pausar movimento animado' : 'Ver movimento animado'}
          className="sm:hidden absolute bottom-2 right-2 px-2 py-0.5 bg-slate-900/80 hover:bg-slate-900 active:bg-slate-950 text-white rounded-md text-[10px] font-medium flex items-center gap-1 backdrop-blur-xs z-10 shadow-xs transition-colors"
        >
          {isTouchActive ? (
            <>
              <Pause className="w-3 h-3 text-indigo-300" />
              <span>Pausar</span>
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
