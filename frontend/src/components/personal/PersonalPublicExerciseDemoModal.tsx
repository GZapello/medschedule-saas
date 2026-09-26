import React, { useState, useEffect } from 'react';
import { X, Play, Dumbbell, Sparkles, AlertCircle, Info, Flame, Check } from 'lucide-react';

export interface ExerciseDemoDetails {
  id?: string;
  exercise_id?: string | null;
  name: string;
  muscle_group: string;
  photo_url?: string | null;
  gif_url?: string | null;
  gif_attribution?: string | null;
  instructions?: string | null;
  technical_notes?: string | null;
  equipment?: string | null;
  category?: string | null;
  sets?: number;
  reps?: string;
  load_kg?: number;
  rest_seconds?: number;
  cadence?: string;
  tempo?: string;
  technique?: string;
  notes?: string;
}

interface PersonalPublicExerciseDemoModalProps {
  exercise: ExerciseDemoDetails | null;
  onClose: () => void;
}

export const PersonalPublicExerciseDemoModal: React.FC<PersonalPublicExerciseDemoModalProps> = ({
  exercise,
  onClose
}) => {
  const [gifFailed, setGifFailed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    setGifFailed(false);
    setPhotoFailed(false);
  }, [exercise]);

  // Fecha com ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!exercise) return null;

  const hasGif = Boolean(exercise.gif_url && !gifFailed);
  const hasPhoto = Boolean(exercise.photo_url && !photoFailed);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Demonstração de ${exercise.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto relative animate-in zoom-in-95 text-slate-100 selection:bg-teal-500 selection:text-white"
      >
        {/* Cabeçalho do Modal */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-extrabold rounded-lg uppercase tracking-wider">
                {exercise.muscle_group || 'Geral'}
              </span>
              {exercise.category && (
                <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-semibold rounded-lg capitalize">
                  {exercise.category}
                </span>
              )}
              {exercise.equipment && (
                <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-semibold rounded-lg">
                  {exercise.equipment}
                </span>
              )}
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white leading-tight">
              {exercise.name}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            title="Fechar demonstração"
            aria-label="Fechar demonstração"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mídia Grande e Centralizada (Desktop max 600-700px, Mobile full width) */}
        <div className="w-full bg-slate-950 rounded-2xl border border-slate-800 p-2 sm:p-3 flex flex-col items-center justify-center relative min-h-[220px] max-h-[360px] overflow-hidden">
          {hasGif ? (
            <img
              src={exercise.gif_url!}
              alt={`Animação de ${exercise.name}`}
              onError={() => setGifFailed(true)}
              className="w-full h-full object-contain max-h-[320px] rounded-xl"
            />
          ) : hasPhoto ? (
            <img
              src={exercise.photo_url!}
              alt={exercise.name}
              onError={() => setPhotoFailed(true)}
              className="w-full h-full object-contain max-h-[320px] rounded-xl"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
              <Dumbbell className="w-12 h-12 text-slate-600 stroke-[1.5]" />
              <p className="text-xs text-slate-400 font-medium">
                Demonstração visual ilustrativa. Siga as instruções técnicas abaixo.
              </p>
            </div>
          )}

          {/* Badge de indicação de animação ativa */}
          {hasGif && (
            <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-slate-900/80 text-teal-300 text-[10px] font-extrabold backdrop-blur-xs flex items-center gap-1 border border-teal-500/20 pointer-events-none">
              <Play className="w-3 h-3 fill-teal-400" />
              Movimento em Loop
            </div>
          )}
        </div>

        {/* Atribuição da Mídia se houver */}
        {exercise.gif_attribution && (
          <p className="text-[10px] text-slate-500 text-right pr-1">
            {exercise.gif_attribution}
          </p>
        )}

        {/* Parâmetros Prescritos (quando disponíveis no contexto) */}
        {(exercise.sets || exercise.reps || exercise.load_kg || exercise.rest_seconds) && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-center text-xs">
            {exercise.sets && (
              <div className="bg-slate-950/70 border border-slate-800 p-2 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Séries</span>
                <strong className="text-sm font-black text-slate-200">{exercise.sets}</strong>
              </div>
            )}
            {exercise.reps && (
              <div className="bg-slate-950/70 border border-slate-800 p-2 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Repetições</span>
                <strong className="text-sm font-black text-teal-400">{exercise.reps}</strong>
              </div>
            )}
            {exercise.load_kg !== undefined && exercise.load_kg !== null && (
              <div className="bg-slate-950/70 border border-slate-800 p-2 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Carga Prescrita</span>
                <strong className="text-sm font-black text-amber-400">{exercise.load_kg} kg</strong>
              </div>
            )}
            {exercise.rest_seconds && (
              <div className="bg-slate-950/70 border border-slate-800 p-2 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Descanso</span>
                <strong className="text-sm font-black text-emerald-400">{exercise.rest_seconds}s</strong>
              </div>
            )}
          </div>
        )}

        {/* Técnica e Cadência */}
        {(exercise.technique || exercise.cadence || exercise.tempo) && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-300 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
            {exercise.technique && (
              <span className="text-teal-300 font-bold">
                Técnica: <span className="font-normal text-slate-200">{exercise.technique}</span>
              </span>
            )}
            {exercise.cadence && (
              <span>• Cadência: <span className="font-mono text-amber-300">{exercise.cadence}</span></span>
            )}
            {exercise.tempo && (
              <span>• Tempo: <span className="font-mono text-amber-300">{exercise.tempo}</span></span>
            )}
          </div>
        )}

        {/* Instruções de Execução */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-teal-400 font-extrabold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            Como executar com técnica correta
          </div>
          <p className="text-slate-300 leading-relaxed whitespace-pre-line text-xs">
            {exercise.instructions ||
              'Mantenha a postura alinhada, contração voluntária da musculatura alvo e execute a amplitude completa do movimento de forma controlada.'}
          </p>
        </div>

        {/* Notas Técnicas / Observações do Personal */}
        {(exercise.technical_notes || exercise.notes) && (
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-1.5 text-xs">
            <span className="font-bold text-amber-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Observações e Dicas de Execução:
            </span>
            <p className="text-slate-300 leading-relaxed text-xs">
              {exercise.technical_notes || exercise.notes}
            </p>
          </div>
        )}

        {/* Botão de Fechar */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 font-black rounded-2xl text-xs sm:text-sm transition-all shadow-lg shadow-teal-500/20 active:scale-98 cursor-pointer"
          >
            Fechar demonstração
          </button>
        </div>
      </div>
    </div>
  );
};
