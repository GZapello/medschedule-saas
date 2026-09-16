import React, { useState } from 'react';
import { X, Camera, ArrowRight, Sparkles, Scale, Activity } from 'lucide-react';
import { AssessmentPhoto } from './types';

interface PersonalBeforeAfterModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: any[];
  studentName?: string;
}

export const PersonalBeforeAfterModal: React.FC<PersonalBeforeAfterModalProps> = ({
  isOpen,
  onClose,
  photos,
  studentName
}) => {
  const [selectedAngle, setSelectedAngle] = useState<'front' | 'back' | 'right' | 'left'>('front');

  if (!isOpen) return null;

  // Filtra fotos pelo ângulo selecionado
  const anglePhotos = photos.filter((p) => p.photo_type === selectedAngle);
  const sortedAnglePhotos = [...anglePhotos].sort(
    (a, b) => new Date(a.photo_date).getTime() - new Date(b.photo_date).getTime()
  );

  const beforePhoto = sortedAnglePhotos[0] || null;
  const afterPhoto = sortedAnglePhotos[sortedAnglePhotos.length - 1] || null;

  const hasPair = beforePhoto && afterPhoto && beforePhoto.id !== afterPhoto.id;

  const deltaWeight = (afterPhoto?.weight || 0) - (beforePhoto?.weight || 0);
  const deltaFat = (afterPhoto?.body_fat_percentage || 0) - (beforePhoto?.body_fat_percentage || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                Comparativo Visual Antes × Depois {studentName ? `— ${studentName}` : ''}
              </h3>
              <p className="text-xs text-slate-500">
                Análise fotográfica de simetria, postura e transformação da composição corporal.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Seletor de Ângulos */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Ângulo Fotográfico:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSelectedAngle('front')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                  selectedAngle === 'front'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Frontal
              </button>
              <button
                onClick={() => setSelectedAngle('back')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                  selectedAngle === 'back'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Posterior (Costas)
              </button>
              <button
                onClick={() => setSelectedAngle('right')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                  selectedAngle === 'right'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Lateral Direita
              </button>
              <button
                onClick={() => setSelectedAngle('left')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                  selectedAngle === 'left'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Lateral Esquerda
              </button>
            </div>
          </div>

          {hasPair && (
            <div className="flex items-center gap-2 text-xs font-bold">
              {deltaWeight !== 0 && (
                <span
                  className={`px-2.5 py-1 rounded-lg ${
                    deltaWeight < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  Peso: {deltaWeight > 0 ? `+${deltaWeight.toFixed(1)}` : deltaWeight.toFixed(1)} kg
                </span>
              )}
              {deltaFat !== 0 && (
                <span
                  className={`px-2.5 py-1 rounded-lg ${
                    deltaFat < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  Gordura: {deltaFat > 0 ? `+${deltaFat.toFixed(1)}` : deltaFat.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* Visualizador Lado a Lado */}
        <div className="p-6 overflow-y-auto flex-1">
          {sortedAnglePhotos.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center gap-3">
              <Camera className="w-10 h-10 text-slate-300" />
              <span>Nenhuma foto cadastrada para o ângulo selecionado.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card ANTES */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">
                    Foto Inicial (Antes)
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {beforePhoto ? new Date(beforePhoto.photo_date).toLocaleDateString('pt-BR') : '—'}
                  </span>
                </div>

                <div className="w-full h-80 sm:h-96 bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center relative shadow-sm">
                  {beforePhoto ? (
                    <img src={beforePhoto.photo_url} alt="Antes" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400">Foto indisponível</span>
                  )}
                </div>

                {beforePhoto && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-around text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Peso</span>
                      <strong className="text-slate-700">{beforePhoto.weight ? `${beforePhoto.weight} kg` : '—'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">% Gordura</span>
                      <strong className="text-amber-600">
                        {beforePhoto.body_fat_percentage ? `${beforePhoto.body_fat_percentage}%` : '—'}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Card DEPOIS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg">
                    Foto Atual (Depois)
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {afterPhoto ? new Date(afterPhoto.photo_date).toLocaleDateString('pt-BR') : '—'}
                  </span>
                </div>

                <div className="w-full h-80 sm:h-96 bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center relative shadow-sm">
                  {afterPhoto ? (
                    <img src={afterPhoto.photo_url} alt="Depois" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400">Aguardando nova reavaliação</span>
                  )}
                </div>

                {afterPhoto && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-around text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Peso</span>
                      <strong className="text-slate-700">{afterPhoto.weight ? `${afterPhoto.weight} kg` : '—'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">% Gordura</span>
                      <strong className="text-emerald-600">
                        {afterPhoto.body_fat_percentage ? `${afterPhoto.body_fat_percentage}%` : '—'}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
