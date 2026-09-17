import React, { useState, useRef } from 'react';
import { Camera, RefreshCw, History, Columns, Trash2, Eye, ShieldAlert, Check, X, ZoomIn } from 'lucide-react';
import { optimizeImageFile } from '../../utils/imageOptimizer';
import { ApiClient } from '../../api/client';
import { SecureFileImage } from './SecureFileImage';

export interface EvolutionPhotoItem {
  id: string;
  url?: string;
  capturedAt: string;
  isInitial?: boolean;
  notes?: string;
  fileId?: string;
  appointmentId?: string;
  isCurrentSession?: boolean;
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
  const [zoomPhoto, setZoomPhoto] = useState<EvolutionPhotoItem | null>(null);

  // Rastreia IDs de fotos adicionadas na sessão/consulta atual em aberto
  const sessionPhotoIdsRef = useRef<Set<string>>(new Set());

  // Foto Inicial é a primeira marcada como isInitial, ou a primeira do histórico
  const initialPhoto = photos.find(p => p.isInitial) || (photos.length > 0 ? photos[0] : null);
  // Foto Atual é a mais recente
  const currentPhoto = photos.length > 0 ? photos[photos.length - 1] : null;

  const canDeletePhoto = (photo: EvolutionPhotoItem): boolean => {
    if (disabled) return false;
    // Apenas a foto da consulta atual em aberto pode ser excluída
    return Boolean(
      photo.isCurrentSession ||
      sessionPhotoIdsRef.current.has(photo.id) ||
      (photo.fileId && sessionPhotoIdsRef.current.has(photo.fileId))
    );
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);

      // 0. Otimização no cliente (mantém original se for diagnóstico)
      const optimizedFile = await optimizeImageFile(file, {
        isDiagnostic,
        maxWidth: 1800,
        maxHeight: 1800,
        quality: 0.85
      });

      // 1. Solicita ticket de upload assinado
      const ticket = await ApiClient.post<any>('/files/upload-ticket', {
        filename: optimizedFile.name,
        mimeType: optimizedFile.type || 'image/jpeg',
        fileSize: optimizedFile.size,
        category,
        patientId: patientId || 'clinic',
        appointmentId
      });

      if (!ticket?.uploadUrl || !ticket?.uploadToken || !ticket?.objectKey) {
        throw new Error('Não foi possível obter autorização de envio para o Cloudflare Worker.');
      }

      // 2. Envio direto via PUT no Cloudflare Worker
      const putRes = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${ticket.uploadToken}`,
          'Content-Type': optimizedFile.type || 'image/jpeg'
        },
        body: optimizedFile
      });

      if (!putRes.ok) {
        throw new Error(`Falha no upload para o Cloudflare Worker (HTTP ${putRes.status}).`);
      }

      // 3. Confirmação do upload no backend
      const comp = await ApiClient.post<any>('/files/complete', {
        objectKey: ticket.objectKey,
        originalFilename: optimizedFile.name,
        mimeType: optimizedFile.type || 'image/jpeg',
        fileSize: optimizedFile.size,
        category,
        patientId: patientId || 'clinic',
        appointmentId
      });

      // CORREÇÃO CRÍTICA: o backend retorna { success: true, file: { id, objectKey, url, ... } }
      const savedFile = comp?.file;
      const confirmedFileId = savedFile?.id;
      const confirmedUrl = savedFile?.url || '';

      if (!confirmedFileId) {
        throw new Error('O servidor não confirmou o identificador do arquivo gravado.');
      }

      // 4. Fluxo de Substituição na mesma consulta:
      // Se o usuário já adicionou uma foto nesta mesma consulta e está trocando antes de salvar,
      // exclui a anterior do R2 após o upload confirmado para não acumular lixo
      const currentSessionPhoto = photos.find(p => canDeletePhoto(p));
      if (currentSessionPhoto) {
        const previousFileId = currentSessionPhoto.fileId || currentSessionPhoto.id;
        try {
          await ApiClient.delete(`/files/${encodeURIComponent(previousFileId)}`);
        } catch (delErr) {
          console.warn('[EvolutionPhotoField] Aviso ao excluir foto substituída da sessão:', delErr);
        }
        sessionPhotoIdsRef.current.delete(currentSessionPhoto.id);
        if (currentSessionPhoto.fileId) sessionPhotoIdsRef.current.delete(currentSessionPhoto.fileId);
      }

      sessionPhotoIdsRef.current.add(confirmedFileId);

      const hasInitialPhoto = photos.some(p => p.isInitial);

      const newPhoto: EvolutionPhotoItem = {
        id: confirmedFileId,
        fileId: confirmedFileId,
        url: confirmedUrl,
        capturedAt: new Date().toISOString(),
        isInitial: !hasInitialPhoto,
        appointmentId,
        isCurrentSession: true
      };

      if (currentSessionPhoto) {
        // Substitui a foto da mesma consulta
        const updated = photos.map(p => p.id === currentSessionPhoto.id ? newPhoto : p);
        onChangePhotos(updated);
      } else {
        // Adiciona como nova foto no histórico (reconsulta preserva a foto inicial)
        onChangePhotos([...photos, newPhoto]);
      }
    } catch (err: any) {
      console.error('[EvolutionPhotoField] Erro no upload:', err);
      alert('Erro ao enviar foto para o servidor: ' + (err.message || 'Verifique sua conexão e tente novamente.'));
      // REGRA OBRIGATÓRIA: NUNCA adiciona blob: local ao histórico de fotos
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (photo: EvolutionPhotoItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (!canDeletePhoto(photo)) {
      alert('Apenas a foto registrada na consulta atual pode ser excluída. Fotos de consultas anteriores são preservadas para integridade do prontuário.');
      return;
    }

    if (!confirm('Deseja realmente remover esta foto da consulta atual?')) return;

    try {
      const targetToDelete = photo.fileId || photo.id;
      await ApiClient.delete(`/files/${encodeURIComponent(targetToDelete)}`);
    } catch (err) {
      console.warn('[EvolutionPhotoField] Erro ao excluir do storage:', err);
    }

    sessionPhotoIdsRef.current.delete(photo.id);
    if (photo.fileId) sessionPhotoIdsRef.current.delete(photo.fileId);

    const remaining = photos.filter(p => p.id !== photo.id);
    if (remaining.length > 0 && !remaining.some(p => p.isInitial)) {
      remaining[0].isInitial = true;
    }
    onChangePhotos(remaining);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3">
      {/* Header with Title and Badges */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Camera className="w-4 h-4 text-teal-600" />
          {label}
        </label>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-500 select-none">
            <input
              type="checkbox"
              checked={isDiagnostic}
              onChange={(e) => setIsDiagnostic(e.target.checked)}
              className="rounded border-slate-300 accent-teal-600 w-3.5 h-3.5"
            />
            <span>Diagnóstico (100% sem perda)</span>
          </label>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Foto Inicial */}
        <div className="border border-dashed border-slate-200 rounded-xl p-2.5 bg-slate-50/70 relative group">
          <div className="text-[11px] font-bold text-slate-500 mb-1 flex items-center justify-between">
            <span>Foto Inicial</span>
            {initialPhoto && (
              <span className="text-[10px] text-slate-400 font-normal">
                {new Date(initialPhoto.capturedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          {initialPhoto ? (
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black/5 flex items-center justify-center">
              <SecureFileImage
                fileId={initialPhoto.fileId || initialPhoto.id}
                fallbackUrl={initialPhoto.url}
                alt="Foto Inicial"
                className="w-full h-full object-cover"
                placeholderText="Foto Inicial"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomPhoto(initialPhoto)}
                  className="p-1.5 bg-white/90 text-slate-800 rounded-full hover:bg-white transition cursor-pointer"
                  title="Ampliar"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                {canDeletePhoto(initialPhoto) && (
                  <button
                    type="button"
                    onClick={(e) => handleDeletePhoto(initialPhoto, e)}
                    className="p-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition cursor-pointer"
                    title="Excluir da consulta atual"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="aspect-video rounded-lg bg-slate-100/70 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Camera className="w-6 h-6 mb-1 opacity-40" />
              <span>Nenhuma foto inicial</span>
            </div>
          )}
        </div>

        {/* Foto Atual */}
        <div className="border border-dashed border-slate-200 rounded-xl p-2.5 bg-slate-50/70 relative group">
          <div className="text-[11px] font-bold text-slate-500 mb-1 flex items-center justify-between">
            <span className="text-teal-700 font-bold">Foto Atual</span>
            {currentPhoto && currentPhoto !== initialPhoto && (
              <span className="text-[10px] text-slate-400 font-normal">
                {new Date(currentPhoto.capturedAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          {currentPhoto ? (
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black/5 flex items-center justify-center">
              <SecureFileImage
                fileId={currentPhoto.fileId || currentPhoto.id}
                fallbackUrl={currentPhoto.url}
                alt="Foto Atual"
                className="w-full h-full object-cover"
                placeholderText="Foto Atual"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomPhoto(currentPhoto)}
                  className="p-1.5 bg-white/90 text-slate-800 rounded-full hover:bg-white transition cursor-pointer"
                  title="Ampliar"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                {canDeletePhoto(currentPhoto) && (
                  <button
                    type="button"
                    onClick={(e) => handleDeletePhoto(currentPhoto, e)}
                    className="p-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition cursor-pointer"
                    title="Excluir da consulta atual"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="aspect-video rounded-lg bg-slate-100/70 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Camera className="w-6 h-6 mb-1 opacity-40" />
              <span>Aguardando captura</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons: [ Adicionar Foto / Atualizar Foto ] [ Histórico ] [ Comparação ] */}
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
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
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
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-slate-500" />
            Histórico ({photos.length})
          </button>
        )}

        {photos.length >= 2 && (
          <button
            type="button"
            onClick={() => setShowCompareModal(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 hover:bg-teal-100/80 text-teal-700 border border-teal-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
          >
            <Columns className="w-3.5 h-3.5 text-teal-600" />
            Comparação
          </button>
        )}
      </div>

      {/* Full-screen Zoom Modal */}
      {zoomPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setZoomPhoto(null)}>
          <div className="relative max-w-4xl max-h-[90vh] bg-transparent" onClick={(e) => e.stopPropagation()}>
            <div className="max-w-full max-h-[85vh] rounded-lg overflow-hidden flex items-center justify-center">
              <SecureFileImage
                fileId={zoomPhoto.fileId || zoomPhoto.id}
                fallbackUrl={zoomPhoto.url}
                alt="Visualização ampliada"
                className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain mx-auto"
                placeholderText="Foto"
              />
            </div>
            <button
              onClick={() => setZoomPhoto(null)}
              className="absolute -top-3 -right-3 p-2 bg-white text-slate-800 rounded-full shadow-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {showCompareModal && initialPhoto && currentPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-4xl rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Columns className="w-5 h-5 text-teal-600" />
                Comparação Fotográfica: {label}
              </h3>
              <button onClick={() => setShowCompareModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/70 p-3 shadow-xs">
                <div className="text-xs font-bold text-slate-700 mb-1.5 flex justify-between">
                  <span>Foto Inicial</span>
                  <span className="font-normal text-slate-400">{new Date(initialPhoto.capturedAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="w-full aspect-video rounded-xl overflow-hidden bg-black/5">
                  <SecureFileImage
                    fileId={initialPhoto.fileId || initialPhoto.id}
                    fallbackUrl={initialPhoto.url}
                    alt="Inicial"
                    className="w-full h-full object-cover"
                    placeholderText="Foto Inicial"
                  />
                </div>
              </div>
              <div className="border border-teal-200 rounded-2xl overflow-hidden bg-teal-50/40 p-3 shadow-xs">
                <div className="text-xs font-bold text-teal-800 mb-1.5 flex justify-between">
                  <span>Foto Atual</span>
                  <span className="font-normal text-teal-600">{new Date(currentPhoto.capturedAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="w-full aspect-video rounded-xl overflow-hidden bg-black/5">
                  <SecureFileImage
                    fileId={currentPhoto.fileId || currentPhoto.id}
                    fallbackUrl={currentPhoto.url}
                    alt="Atual"
                    className="w-full h-full object-cover"
                    placeholderText="Foto Atual"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowCompareModal(false)}
                className="px-5 py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold hover:bg-teal-700 transition-colors shadow-xs cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-3xl rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-teal-600" />
                Histórico Fotográfico ({photos.length})
              </h3>
              <button onClick={() => setShowHistoryModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 p-1">
              {photos.map((photo, idx) => (
                <div key={photo.id} className="relative group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70 p-1.5 shadow-xs">
                  <div className="w-full aspect-square rounded-lg overflow-hidden bg-black/5">
                    <SecureFileImage
                      fileId={photo.fileId || photo.id}
                      fallbackUrl={photo.url}
                      alt={`Foto ${idx + 1}`}
                      className="w-full h-full object-cover"
                      placeholderText={`Foto #${idx + 1}`}
                    />
                  </div>
                  <div className="mt-1.5 text-[11px] text-slate-600 flex items-center justify-between px-1">
                    <span className="font-semibold">{photo.isInitial ? 'Inicial' : `#${idx + 1}`}</span>
                    <span className="text-slate-400">{new Date(photo.capturedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setZoomPhoto(photo)}
                      className="p-1.5 bg-white text-slate-800 rounded-full cursor-pointer hover:bg-slate-100 transition"
                      title="Ampliar"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    {canDeletePhoto(photo) && (
                      <button
                        type="button"
                        onClick={(e) => handleDeletePhoto(photo, e)}
                        className="p-1.5 bg-rose-600 text-white rounded-full cursor-pointer hover:bg-rose-700 transition"
                        title="Excluir da consulta atual"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-5 py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold hover:bg-teal-700 transition-colors shadow-xs cursor-pointer"
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
