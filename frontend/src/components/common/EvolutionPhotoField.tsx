import React, { useState, useRef } from 'react';
import { Camera, RefreshCw, History, Columns, Trash2, Eye, ShieldAlert, Check, X, ZoomIn } from 'lucide-react';
import { optimizeImageFile } from '../../utils/imageOptimizer';
import { ApiClient } from '../../api/client';

export interface EvolutionPhotoItem {
  id: string;
  url: string;
  capturedAt: string;
  isInitial?: boolean;
  notes?: string;
  fileId?: string;
}

export interface EvolutionPhotoFieldProps {
  label: string;
  category?: string;
  patientId?: string;
  appointmentId?: string;
  photos: EvolutionPhotoItem[];
  onChangePhotos: (photos: EvolutionPhotoItem[]) => void;
  disabled?: boolean;
}

export const EvolutionPhotoField: React.FC<EvolutionPhotoFieldProps> = ({
  label,
  category = 'clinical_evolution',
  patientId,
  appointmentId,
  photos = [],
  onChangePhotos,
  disabled = false
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDiagnostic, setIsDiagnostic] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  const initialPhoto = photos.find(p => p.isInitial) || photos[0] || null;
  const currentPhoto = photos.length > 0 ? photos[photos.length - 1] : null;

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);

      // Client-side image optimization (skips if isDiagnostic is true)
      const optimizedFile = await optimizeImageFile(file, {
        isDiagnostic,
        maxWidth: 1800,
        maxHeight: 1800,
        quality: 0.85
      });

      let fileId = 'photo-' + Date.now();
      let photoUrl = '';

      try {
        const ticket = await ApiClient.post<any>('/files/upload-ticket', {
          filename: optimizedFile.name,
          mimeType: optimizedFile.type || 'image/jpeg',
          fileSize: optimizedFile.size,
          category,
          patientId: patientId || 'clinic',
          appointmentId
        });

        if (ticket?.uploadUrl && ticket?.uploadToken) {
          const putRes = await fetch(ticket.uploadUrl, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${ticket.uploadToken}`,
              'Content-Type': optimizedFile.type || 'image/jpeg'
            },
            body: optimizedFile
          });

          if (putRes.ok) {
            const comp = await ApiClient.post<any>('/files/complete', {
              objectKey: ticket.objectKey,
              originalFilename: optimizedFile.name,
              mimeType: optimizedFile.type || 'image/jpeg',
              fileSize: optimizedFile.size,
              category,
              patientId: patientId || 'clinic',
              appointmentId
            });
            fileId = comp?.id || ticket.objectKey;
            photoUrl = comp?.url || '';
          }
        }
      } catch (uploadErr) {
        console.warn('[EvolutionPhotoField] Upload via ticket falhou, usando blob URL local:', uploadErr);
      }

      if (!photoUrl) {
        photoUrl = URL.createObjectURL(optimizedFile);
      }

      const newPhoto: EvolutionPhotoItem = {
        id: fileId,
        url: photoUrl,
        capturedAt: new Date().toISOString(),
        isInitial: photos.length === 0,
        fileId
      };

      onChangePhotos([...photos, newPhoto]);
    } catch (err: any) {
      console.error('[EvolutionPhotoField] Upload error:', err);
      // Local preview fallback if upload endpoint fails
      const localUrl = URL.createObjectURL(file);
      const newPhoto: EvolutionPhotoItem = {
        id: 'photo-loc-' + Date.now(),
        url: localUrl,
        capturedAt: new Date().toISOString(),
        isInitial: photos.length === 0
      };
      onChangePhotos([...photos, newPhoto]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Deseja realmente remover esta foto?')) return;
    const remaining = photos.filter(p => p.id !== id);
    // If we deleted initial photo and there are photos left, designate first as initial
    if (remaining.length > 0 && !remaining.some(p => p.isInitial)) {
      remaining[0].isInitial = true;
    }
    onChangePhotos(remaining);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
      {/* Header with Title and Badges */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Camera className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          {label}
        </label>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-500 dark:text-slate-400 select-none">
            <input
              type="checkbox"
              checked={isDiagnostic}
              onChange={(e) => setIsDiagnostic(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
            />
            <span>Diagnóstico (100% sem perda)</span>
          </label>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Foto Inicial */}
        <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-2.5 bg-slate-50 dark:bg-slate-800/40 relative group">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center justify-between">
            <span>Foto Inicial</span>
            {initialPhoto && (
              <span className="text-[10px] text-slate-400 font-normal">
                {new Date(initialPhoto.capturedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          {initialPhoto ? (
            <div className="relative aspect-video rounded-md overflow-hidden bg-black/10 flex items-center justify-center">
              <img src={initialPhoto.url} alt="Foto Inicial" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomUrl(initialPhoto.url)}
                  className="p-1.5 bg-white/90 text-slate-800 rounded-full hover:bg-white transition"
                  title="Ampliar"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => handleDeletePhoto(initialPhoto.id, e)}
                    className="p-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="aspect-video rounded-md bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Camera className="w-6 h-6 mb-1 opacity-40" />
              <span>Nenhuma foto inicial</span>
            </div>
          )}
        </div>

        {/* Foto Atual */}
        <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-2.5 bg-slate-50 dark:bg-slate-800/40 relative group">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center justify-between">
            <span className="text-indigo-600 dark:text-indigo-400">Foto Atual</span>
            {currentPhoto && currentPhoto !== initialPhoto && (
              <span className="text-[10px] text-slate-400 font-normal">
                {new Date(currentPhoto.capturedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          {currentPhoto ? (
            <div className="relative aspect-video rounded-md overflow-hidden bg-black/10 flex items-center justify-center">
              <img src={currentPhoto.url} alt="Foto Atual" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomUrl(currentPhoto.url)}
                  className="p-1.5 bg-white/90 text-slate-800 rounded-full hover:bg-white transition"
                  title="Ampliar"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => handleDeletePhoto(currentPhoto.id, e)}
                    className="p-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="aspect-video rounded-md bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Camera className="w-6 h-6 mb-1 opacity-40" />
              <span>Aguardando captura</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons: [ Atualizar foto ] [ Histórico ] [ Comparação ] */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelected}
          accept="image/*"
          className="hidden"
          disabled={disabled || isUploading}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
        >
          {isUploading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Otimizando e enviando...
            </>
          ) : (
            <>
              <Camera className="w-3.5 h-3.5" />
              {photos.length === 0 ? 'Adicionar Foto Inicial' : 'Atualizar Foto'}
            </>
          )}
        </button>

        {photos.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            <History className="w-3.5 h-3.5 text-slate-500" />
            Histórico ({photos.length})
          </button>
        )}

        {photos.length >= 2 && (
          <button
            type="button"
            onClick={() => setShowCompareModal(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-medium transition-colors"
          >
            <Columns className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Comparação
          </button>
        )}
      </div>

      {/* Full-screen Zoom Modal */}
      {zoomUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setZoomUrl(null)}>
          <div className="relative max-w-4xl max-h-[90vh] bg-transparent">
            <img src={zoomUrl} alt="Visualização ampliada" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain mx-auto" />
            <button
              onClick={() => setZoomUrl(null)}
              className="absolute -top-3 -right-3 p-2 bg-white text-slate-800 rounded-full shadow-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {showCompareModal && initialPhoto && currentPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Columns className="w-5 h-5 text-indigo-600" />
                Comparação Fotográfica: {label}
              </h3>
              <button onClick={() => setShowCompareModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800/50 p-2">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 flex justify-between">
                  <span>Foto Inicial</span>
                  <span className="font-normal text-slate-400">{new Date(initialPhoto.capturedAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <img src={initialPhoto.url} alt="Inicial" className="w-full aspect-video object-cover rounded-lg" />
              </div>
              <div className="border border-indigo-200 dark:border-indigo-800 rounded-xl overflow-hidden bg-indigo-50/30 dark:bg-indigo-950/20 p-2">
                <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1.5 flex justify-between">
                  <span>Foto Atual</span>
                  <span className="font-normal text-indigo-400">{new Date(currentPhoto.capturedAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <img src={currentPhoto.url} alt="Atual" className="w-full aspect-video object-cover rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowCompareModal(false)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-900"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                Histórico Fotográfico ({photos.length})
              </h3>
              <button onClick={() => setShowHistoryModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 p-1">
              {photos.map((photo, idx) => (
                <div key={photo.id} className="relative group border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800/40 p-1.5">
                  <img src={photo.url} alt={`Foto ${idx + 1}`} className="w-full aspect-square object-cover rounded" />
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span className="font-semibold">{photo.isInitial ? 'Inicial' : `#${idx + 1}`}</span>
                    <span>{new Date(photo.capturedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setZoomUrl(photo.url)}
                      className="p-1 bg-white text-slate-800 rounded-full"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={(e) => handleDeletePhoto(photo.id, e)}
                        className="p-1 bg-rose-600 text-white rounded-full"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-900"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
