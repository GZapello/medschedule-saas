import React, { useState, useRef, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import {
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  X,
  AlertCircle,
  Eye,
  RefreshCw,
  Trash2,
  Loader2,
  ExternalLink
} from 'lucide-react';

export interface FileUploadedInfo {
  id: string;
  objectKey: string;
  url?: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
}

export interface FileImageUploaderProps {
  patientId?: string;
  appointmentId?: string;
  category?: string;
  initialUrl?: string;
  initialFileId?: string;
  initialFilename?: string;
  label?: string;
  buttonText?: string;
  autoUpload?: boolean;
  className?: string;
  onUploaded?: (fileInfo: FileUploadedInfo) => void;
  onRemoved?: () => void;
  onError?: (errorMessage: string) => void;
  disabled?: boolean;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const FileImageUploader: React.FC<FileImageUploaderProps> = ({
  patientId,
  appointmentId,
  category = 'attachments',
  initialUrl,
  initialFileId,
  initialFilename,
  label = 'Imagem / Anexo',
  buttonText = '+ Adicionar imagem',
  autoUpload = true,
  className = '',
  onUploaded,
  onRemoved,
  onError,
  disabled = false
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [currentFileId, setCurrentFileId] = useState<string | null>(initialFileId || null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(initialUrl || null);
  const [currentFilename, setCurrentFilename] = useState<string | null>(initialFilename || null);
  const [currentFileSize, setCurrentFileSize] = useState<number | null>(null);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal Viewer
  const [isViewerOpen, setIsViewerOpen] = useState<boolean>(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [isLoadingViewUrl, setIsLoadingViewUrl] = useState<boolean>(false);

  // Sync initial props
  useEffect(() => {
    if (initialUrl) {
      setCurrentUrl(initialUrl);
    }
    if (initialFileId) {
      setCurrentFileId(initialFileId);
    }
    if (initialFilename) {
      setCurrentFilename(initialFilename);
    }
  }, [initialUrl, initialFileId, initialFilename]);

  // Clean up object URLs on unmount or file change
  useEffect(() => {
    return () => {
      if (selectedPreview && selectedPreview.startsWith('blob:')) {
        URL.revokeObjectURL(selectedPreview);
      }
    };
  }, [selectedPreview]);

  // Format file size in MB
  const formatSizeInMB = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  // Trigger file chooser
  const handleOpenFileDialog = () => {
    if (disabled || isUploading) return;
    setErrorMessage(null);
    fileInputRef.current?.click();
  };

  // Validate and select file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so re-selecting same file triggers event
    e.target.value = '';

    // Validate size (max 10 MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const err = `O arquivo selecionado (${formatSizeInMB(file.size)}) excede o limite máximo permitido de 10 MB.`;
      setErrorMessage(err);
      onError?.(err);
      return;
    }

    // Validate mime type
    const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.type);
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const isAllowedExt = ['jpg', 'jpeg', 'png', 'webp'].includes(fileExt || '');

    if (!isAllowedMime && !isAllowedExt) {
      const err = 'Formato de arquivo não suportado. Apenas imagens JPG, PNG e WebP são permitidas.';
      setErrorMessage(err);
      onError?.(err);
      return;
    }

    // Success validation: create local thumbnail preview
    setErrorMessage(null);
    if (selectedPreview && selectedPreview.startsWith('blob:')) {
      URL.revokeObjectURL(selectedPreview);
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setSelectedPreview(objectUrl);
    setUploadSuccess(false);

    if (autoUpload) {
      uploadDirectly(file);
    }
  };

  // Upload directo para Cloudflare R2
  const uploadDirectly = async (fileToUpload: File) => {
    const effectivePatientId = patientId || 'clinic';

    setIsUploading(true);
    setErrorMessage(null);
    setUploadSuccess(false);

    try {
      // 1. Solicita URL assinada do Cloudflare R2 ao backend
      const uploadUrlResponse = await ApiClient.post<{
        uploadUrl: string;
        objectKey: string;
        expiresIn: number;
      }>('/files/upload-url', {
        patientId: effectivePatientId,
        category,
        filename: fileToUpload.name,
        mimeType: fileToUpload.type || 'image/jpeg',
        fileSize: fileToUpload.size
      });

      const { uploadUrl, objectKey } = uploadUrlResponse;
      if (!uploadUrl || !objectKey) {
        throw new Error('Falha ao obter URL de envio pré-assinada.');
      }

      // 2. Upload direto do navegador para o Cloudflare R2
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': fileToUpload.type || 'image/jpeg'
        },
        body: fileToUpload
      });

      if (!putResponse.ok) {
        throw new Error(`Falha no upload direto para o armazenamento R2 (HTTP ${putResponse.status}).`);
      }

      // 3. Completa e persiste metadados no backend
      const completeResponse = await ApiClient.post<{
        success: boolean;
        file: FileUploadedInfo;
      }>('/files/complete', {
        patientId: effectivePatientId,
        appointmentId,
        category,
        objectKey,
        originalFilename: fileToUpload.name,
        mimeType: fileToUpload.type || 'image/jpeg',
        fileSize: fileToUpload.size
      });

      const savedFile = completeResponse.file;

      // Atualiza estados
      setCurrentFileId(savedFile.id);
      setCurrentFilename(savedFile.originalFilename);
      setCurrentFileSize(savedFile.fileSize);
      setCurrentUrl(savedFile.url || null);
      setUploadSuccess(true);

      // Limpa prévia local
      if (selectedPreview && selectedPreview.startsWith('blob:')) {
        URL.revokeObjectURL(selectedPreview);
      }
      setSelectedFile(null);
      setSelectedPreview(null);

      // Notifica componente pai
      onUploaded?.(savedFile);
    } catch (err: any) {
      console.error('[FileImageUploader] Erro no upload:', err);
      const msg = err.message || 'Erro ao enviar o arquivo para o Cloudflare R2.';
      setErrorMessage(msg);
      onError?.(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // Cancel selected file before upload
  const handleCancelSelection = () => {
    if (selectedPreview && selectedPreview.startsWith('blob:')) {
      URL.revokeObjectURL(selectedPreview);
    }
    setSelectedFile(null);
    setSelectedPreview(null);
    setErrorMessage(null);
  };

  // Direct upload to Cloudflare R2 (manual trigger se autoUpload for falso)
  const handleStartUpload = async () => {
    if (!selectedFile) return;
    await uploadDirectly(selectedFile);
  };

  // Open viewer modal with signed temporary URL
  const handleOpenViewer = async () => {
    setIsViewerOpen(true);
    setErrorMessage(null);

    // If it's a legacy external URL or already signed URL
    if (currentUrl && (currentUrl.startsWith('http') || currentUrl.startsWith('/'))) {
      setViewerUrl(currentUrl);
      return;
    }

    // If we have an attachment ID, get fresh 5-minute signed URL from backend
    if (currentFileId) {
      try {
        setIsLoadingViewUrl(true);
        const res = await ApiClient.get<{ url: string; originalFilename?: string }>(`/files/${currentFileId}/url`);
        setViewerUrl(res.url);
      } catch (err: any) {
        setErrorMessage('Não foi possível carregar a imagem para visualização.');
      } finally {
        setIsLoadingViewUrl(false);
      }
    }
  };

  // Remove file
  const handleRemoveFile = async () => {
    if (!window.confirm('Tem certeza que deseja remover esta imagem?')) return;

    try {
      if (currentFileId) {
        await ApiClient.delete(`/files/${currentFileId}`);
      }
      setCurrentFileId(null);
      setCurrentUrl(null);
      setCurrentFilename(null);
      setCurrentFileSize(null);
      setUploadSuccess(false);
      setErrorMessage(null);

      if (selectedPreview && selectedPreview.startsWith('blob:')) {
        URL.revokeObjectURL(selectedPreview);
      }
      setSelectedFile(null);
      setSelectedPreview(null);

      onRemoved?.();
    } catch (err: any) {
      const msg = err.message || 'Erro ao excluir o anexo.';
      setErrorMessage(msg);
    }
  };

  const hasExistingFile = Boolean(currentUrl || currentFileId);

  return (
    <div className={`w-full bg-white rounded-2xl border border-slate-200/80 p-4 transition-all shadow-sm ${className}`}>
      {/* Hidden native input supporting camera, gallery and device storage files */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* Header section */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-800">{label}</h4>
        </div>
        {uploadSuccess && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full animate-fadeIn">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Upload concluído.
          </span>
        )}
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200/80 flex items-start gap-2.5 text-xs text-rose-700 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-600 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Loading state during upload */}
      {isUploading && (
        <div className="flex items-center gap-3 p-4 bg-teal-50/80 rounded-xl border border-teal-200 animate-pulse">
          <Loader2 className="w-5 h-5 animate-spin text-teal-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-teal-900">Enviando para o Cloudflare R2...</p>
            <p className="text-[11px] text-teal-700">Aguarde a conclusão do upload seguro.</p>
          </div>
        </div>
      )}

      {/* STATE 1: Selected file pending upload (quando autoUpload for falso) */}
      {!isUploading && selectedFile && selectedPreview && (
        <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-200 flex-shrink-0 border border-slate-300">
              <img
                src={selectedPreview}
                alt="Prévia"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate" title={selectedFile.name}>
                {selectedFile.name}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {formatSizeInMB(selectedFile.size)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancelSelection}
              disabled={isUploading}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleStartUpload}
              disabled={isUploading}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Enviar</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE 2: Existing or uploaded file view */}
      {!isUploading && !selectedFile && hasExistingFile && (
        <div className="flex items-center justify-between p-3 bg-slate-50/80 rounded-xl border border-slate-200 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-200 flex-shrink-0 border border-slate-300">
              {currentUrl ? (
                <img
                  src={currentUrl}
                  alt={currentFilename || 'Anexo'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback thumbnail placeholder on error
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800 truncate" title={currentFilename || 'Imagem anexada'}>
                {currentFilename || 'Imagem anexada'}
              </p>
              {currentFileSize ? (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {formatSizeInMB(currentFileSize)}
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 mt-0.5">Anexo registrado</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleOpenViewer}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition flex items-center gap-1 shadow-2xs"
              title="Visualizar imagem"
            >
              <Eye className="w-3.5 h-3.5 text-teal-600" />
              <span>Visualizar</span>
            </button>

            <button
              type="button"
              onClick={handleOpenFileDialog}
              disabled={disabled || isUploading}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition flex items-center gap-1 shadow-2xs disabled:opacity-50"
              title="Substituir imagem"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Substituir</span>
            </button>

            <button
              type="button"
              onClick={handleRemoveFile}
              disabled={disabled || isUploading}
              className="px-2.5 py-1.5 text-xs font-medium text-rose-600 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition flex items-center gap-1 shadow-2xs disabled:opacity-50"
              title="Remover anexo"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remover</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE 3: Empty state with button to add image */}
      {!isUploading && !selectedFile && !hasExistingFile && (
        <div className="text-center py-4 px-2">
          <button
            type="button"
            onClick={handleOpenFileDialog}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition shadow-2xs disabled:opacity-50"
          >
            <Upload className="w-4 h-4 text-teal-600" />
            <span>{buttonText}</span>
          </button>
          <p className="text-[11px] text-slate-400 mt-2">
            Aceita JPG, PNG e WebP até 10 MB (Câmera, Galeria ou Arquivos)
          </p>
        </div>
      )}

      {/* MODAL VIEWER */}
      {isViewerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setIsViewerOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <span className="text-xs font-semibold text-slate-800 truncate">
                  {currentFilename || 'Visualização do Anexo'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {viewerUrl && (
                  <a
                    href={viewerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition"
                    title="Abrir em nova aba"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setIsViewerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
                  title="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-4 overflow-auto flex items-center justify-center bg-slate-950/5 min-h-[300px]">
              {isLoadingViewUrl ? (
                <div className="flex flex-col items-center justify-center gap-2 text-slate-500 text-xs py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
                  <span>Carregando visualização segura...</span>
                </div>
              ) : viewerUrl ? (
                <img
                  src={viewerUrl}
                  alt={currentFilename || 'Anexo'}
                  className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-sm"
                />
              ) : (
                <div className="text-center text-xs text-slate-400 py-10">
                  Não foi possível exibir a imagem.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
