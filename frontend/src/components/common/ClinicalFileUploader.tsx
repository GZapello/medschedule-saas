import React, { useState, useRef, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { cacheFileUrl } from './SecureFileImage';
import { optimizeImageFile } from '../../utils/imageOptimizer';
import {
  Upload,
  Image as ImageIcon,
  FileText,
  FileSpreadsheet,
  File,
  CheckCircle2,
  X,
  AlertCircle,
  Eye,
  Download,
  RefreshCw,
  Trash2,
  Loader2,
  ExternalLink,
  Lock
} from 'lucide-react';

export interface FileUploadedInfo {
  id: string;
  fileId?: string;
  objectKey: string;
  url?: string;
  originalFilename?: string;
  filename?: string;
  mimeType: string;
  fileSize: number;
}

export interface ClinicalFileUploaderProps {
  patientId: string;
  appointmentId?: string;
  assessmentId?: string;
  moduleType?: string;
  professionalId?: string;
  category?: string;
  initialFileId?: string;
  initialUrl?: string;
  initialFilename?: string;
  initialMimeType?: string;
  initialFileSize?: number;
  label?: string;
  buttonText?: string;
  disabled?: boolean;
  isSealed?: boolean;
  className?: string;
  onUploaded?: (fileInfo: FileUploadedInfo) => void;
  onRemoved?: () => void;
  onError?: (errorMessage: string) => void;
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'application/csv'
];

const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ClinicalFileUploader: React.FC<ClinicalFileUploaderProps> = ({
  patientId,
  appointmentId,
  assessmentId,
  moduleType,
  professionalId,
  category = 'clinical_tests',
  initialFileId,
  initialUrl,
  initialFilename,
  initialMimeType,
  initialFileSize,
  label = 'Anexo do Teste / Documento',
  buttonText = 'Selecionar Arquivo',
  disabled = false,
  isSealed = false,
  className = '',
  onUploaded,
  onRemoved,
  onError
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentFileId, setCurrentFileId] = useState<string | null>(initialFileId || null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(initialUrl || null);
  const [currentFilename, setCurrentFilename] = useState<string | null>(initialFilename || null);
  const [currentMimeType, setCurrentMimeType] = useState<string | null>(initialMimeType || null);
  const [currentFileSize, setCurrentFileSize] = useState<number | null>(initialFileSize || null);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Viewer Modal para imagens e PDF
  const [isViewerOpen, setIsViewerOpen] = useState<boolean>(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerType, setViewerType] = useState<'image' | 'pdf' | 'doc'>('image');
  const [isLoadingViewUrl, setIsLoadingViewUrl] = useState<boolean>(false);

  useEffect(() => {
    if (initialFileId) setCurrentFileId(initialFileId);
    if (initialUrl) setCurrentUrl(initialUrl);
    if (initialFilename) setCurrentFilename(initialFilename);
    if (initialMimeType) setCurrentMimeType(initialMimeType);
    if (initialFileSize) setCurrentFileSize(initialFileSize);
  }, [initialFileId, initialUrl, initialFilename, initialMimeType, initialFileSize]);

  // Se existir fileId mas a URL estiver vazia ou expirada, busca URL assinada fresca do Worker
  useEffect(() => {
    if (currentFileId && (!currentUrl || currentUrl.includes('r2.cloudflarestorage.com'))) {
      let isMounted = true;
      ApiClient.get<{
        url: string;
        filename?: string;
        originalFilename?: string;
        mimeType?: string;
        fileSize?: number;
      }>(`/files/${encodeURIComponent(currentFileId)}/url`)
        .then(res => {
          if (isMounted && res.url) {
            cacheFileUrl(currentFileId, res.url, 240);
            setCurrentUrl(res.url);
            if (res.originalFilename || res.filename) {
              setCurrentFilename(res.originalFilename || res.filename || null);
            }
            if (res.mimeType) setCurrentMimeType(res.mimeType);
            if (res.fileSize) setCurrentFileSize(res.fileSize);
          }
        })
        .catch(err => {
          console.warn('[ClinicalFileUploader] Erro ao recuperar URL segura do Worker:', err);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [currentFileId]);

  const formatSize = (bytes?: number | null): string => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileCategory = (filename?: string | null, mime?: string | null): 'image' | 'pdf' | 'word' | 'excel' | 'csv' | 'other' => {
    const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
    const m = (mime || '').toLowerCase();

    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) || m.startsWith('image/')) return 'image';
    if (ext === 'pdf' || m.includes('pdf')) return 'pdf';
    if (['doc', 'docx'].includes(ext) || m.includes('word') || m.includes('officedocument.wordprocessingml')) return 'word';
    if (['xls', 'xlsx'].includes(ext) || m.includes('excel') || m.includes('spreadsheetml')) return 'excel';
    if (ext === 'csv' || m.includes('csv')) return 'csv';
    return 'other';
  };

  const handleOpenFileDialog = () => {
    if (disabled || isUploading || isSealed) return;
    setErrorMessage(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const err = `O arquivo selecionado (${formatSize(file.size)}) excede o limite máximo permitido de 10 MB.`;
      setErrorMessage(err);
      onError?.(err);
      return;
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const isAllowedExt = ALLOWED_EXTS.includes(fileExt);
    const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.type);

    if (!isAllowedExt && !isAllowedMime) {
      const err = 'Formato não suportado. Formatos aceitos: JPG, PNG, WebP, PDF, DOC, DOCX, XLS, XLSX, CSV.';
      setErrorMessage(err);
      onError?.(err);
      return;
    }

    setErrorMessage(null);
    uploadDirectly(file);
  };

  const uploadDirectly = async (fileToUpload: File) => {
    if (!patientId) {
      const msg = 'Selecione um paciente antes de anexar arquivos.';
      setErrorMessage(msg);
      onError?.(msg);
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setUploadSuccess(false);

    try {
      // 1. Otimiza somente se for imagem
      const preparedFile = fileToUpload.type.startsWith('image/')
        ? await optimizeImageFile(fileToUpload, { maxWidth: 1800, maxHeight: 1800, quality: 0.85 })
        : fileToUpload;

      // 2. POST /files/upload-ticket
      const ticketResponse = await ApiClient.post<{
        uploadUrl: string;
        uploadToken: string;
        objectKey: string;
      }>('/files/upload-ticket', {
        filename: preparedFile.name,
        mimeType: preparedFile.type || 'application/octet-stream',
        fileSize: preparedFile.size,
        category,
        patientId,
        appointmentId: appointmentId || undefined,
        assessmentId: assessmentId || undefined,
        professionalId: professionalId || undefined,
        moduleType: moduleType || undefined
      });

      const { uploadUrl, uploadToken, objectKey } = ticketResponse;
      if (!uploadUrl || !uploadToken || !objectKey) {
        throw new Error('Falha ao obter ticket de envio para o Cloudflare Worker.');
      }

      // 3. PUT para o Cloudflare Worker
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${uploadToken}`,
          'Content-Type': preparedFile.type || 'application/octet-stream'
        },
        body: preparedFile
      });

      let workerResult: any = {};
      try {
        workerResult = await putResponse.json();
      } catch (_) {}

      if (!putResponse.ok || !workerResult || workerResult.ok !== true) {
        throw new Error(workerResult?.error || `Falha no upload para o Cloudflare Worker (HTTP ${putResponse.status}).`);
      }

      const finalObjectKey = workerResult.objectKey || objectKey;

      // 4. POST /files/complete
      const completeResponse = await ApiClient.post<{
        success: boolean;
        file: FileUploadedInfo;
      }>('/files/complete', {
        objectKey: finalObjectKey,
        filename: preparedFile.name,
        originalFilename: preparedFile.name,
        mimeType: preparedFile.type || workerResult.contentType || 'application/octet-stream',
        fileSize: preparedFile.size || workerResult.size,
        category,
        patientId,
        appointmentId: appointmentId || undefined,
        assessmentId: assessmentId || undefined,
        professionalId: professionalId || undefined,
        moduleType: moduleType || undefined
      });

      const savedFile = completeResponse.file;

      // Se havia um anexo anterior diferente e não selado, remove
      if (currentFileId && currentFileId !== savedFile.id && !isSealed) {
        try {
          await ApiClient.delete(`/files/${encodeURIComponent(currentFileId)}`);
        } catch (_) {}
      }

      // Atualiza estados locais
      setCurrentFileId(savedFile.id);
      setCurrentUrl(savedFile.url || null);
      setCurrentFilename(savedFile.originalFilename || savedFile.filename || preparedFile.name);
      setCurrentMimeType(savedFile.mimeType || preparedFile.type);
      setCurrentFileSize(savedFile.fileSize || preparedFile.size);

      if (savedFile.id && savedFile.url) {
        cacheFileUrl(savedFile.id, savedFile.url, 240);
      }

      setUploadSuccess(true);
      onUploaded?.(savedFile);
    } catch (err: any) {
      console.error('[ClinicalFileUploader] Erro no fluxo de upload:', err);
      const msg = err.message || 'Erro ao realizar upload do arquivo.';
      setErrorMessage(msg);
      onError?.(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // Garante URL de visualização/download assinada recente
  const getFreshUrl = async (): Promise<string | null> => {
    if (currentUrl && !currentUrl.includes('r2.cloudflarestorage.com')) {
      return currentUrl;
    }
    if (!currentFileId) return null;

    try {
      setIsLoadingViewUrl(true);
      const res = await ApiClient.get<{ url: string }>(`/files/${encodeURIComponent(currentFileId)}/url`);
      if (res.url) {
        cacheFileUrl(currentFileId, res.url, 240);
        setCurrentUrl(res.url);
        return res.url;
      }
    } catch (e) {
      console.warn('[ClinicalFileUploader] Erro ao obter URL:', e);
    } finally {
      setIsLoadingViewUrl(false);
    }
    return null;
  };

  // Ação 1: Visualizar
  const handleView = async () => {
    const cat = getFileCategory(currentFilename, currentMimeType);
    const url = await getFreshUrl();
    if (!url) {
      setErrorMessage('URL de visualização indisponível.');
      return;
    }

    if (cat === 'image') {
      setViewerType('image');
      setViewerUrl(url);
      setIsViewerOpen(true);
    } else if (cat === 'pdf') {
      setViewerType('pdf');
      setViewerUrl(url);
      setIsViewerOpen(true);
    } else {
      // DOCX, XLSX, CSV não são renderizados como imagem: abre para download/aplicativo padrão
      handleDownload();
    }
  };

  // Ação 2: Baixar
  const handleDownload = async () => {
    const url = await getFreshUrl();
    if (!url) return;

    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.download = currentFilename || 'anexo_clinico';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      window.open(url, '_blank');
    }
  };

  // Ação 3: Substituir
  const handleSubstitute = () => {
    if (isSealed) return;
    handleOpenFileDialog();
  };

  // Ação 4: Excluir
  const handleDelete = async () => {
    if (isSealed) return;
    if (!window.confirm('Deseja remover este anexo?')) return;

    if (currentFileId) {
      try {
        await ApiClient.delete(`/files/${encodeURIComponent(currentFileId)}`);
      } catch (err) {
        console.warn('[ClinicalFileUploader] Erro ao deletar arquivo:', err);
      }
    }

    setCurrentFileId(null);
    setCurrentUrl(null);
    setCurrentFilename(null);
    setCurrentMimeType(null);
    setCurrentFileSize(null);
    setUploadSuccess(false);
    setErrorMessage(null);

    onRemoved?.();
  };

  const fileCat = getFileCategory(currentFilename, currentMimeType);

  return (
    <div className={`space-y-3 ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-slate-700">
          {label}
        </label>
      )}

      {/* Input de arquivo invisível */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isUploading || isSealed}
      />

      {/* Estado: Arquivo Anexado */}
      {currentFileId || currentUrl ? (
        <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 hover:border-slate-300 transition-all space-y-3">
          <div className="flex items-center gap-3">
            {/* Ícone por tipo de arquivo */}
            <div className="shrink-0">
              {fileCat === 'image' && (
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 bg-white flex items-center justify-center cursor-pointer group relative shadow-xs" onClick={handleView}>
                  {currentUrl ? (
                    <img src={currentUrl} alt={currentFilename || 'Anexo'} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-sky-600" />
                  )}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Eye className="w-4 h-4 text-white" />
                  </div>
                </div>
              )}

              {fileCat === 'pdf' && (
                <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex flex-col items-center justify-center text-rose-600 shadow-xs">
                  <FileText className="w-6 h-6" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">PDF</span>
                </div>
              )}

              {fileCat === 'word' && (
                <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex flex-col items-center justify-center text-blue-600 shadow-xs">
                  <File className="w-6 h-6" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">DOCX</span>
                </div>
              )}

              {(fileCat === 'excel' || fileCat === 'csv') && (
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col items-center justify-center text-emerald-600 shadow-xs">
                  <FileSpreadsheet className="w-6 h-6" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">
                    {fileCat === 'csv' ? 'CSV' : 'XLSX'}
                  </span>
                </div>
              )}

              {fileCat === 'other' && (
                <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-600 shadow-xs">
                  <File className="w-6 h-6" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">FILE</span>
                </div>
              )}
            </div>

            {/* Informações do arquivo */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-800 truncate" title={currentFilename || ''}>
                  {currentFilename || 'Arquivo Anexado'}
                </span>
                {uploadSuccess && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Enviado ao R2
                  </span>
                )}
                {isSealed && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded-md">
                    <Lock className="w-3 h-3" />
                    Registro Selado
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {formatSize(currentFileSize) ? `${formatSize(currentFileSize)} • ` : ''}
                {fileCat === 'image' && 'Imagem / Foto do Protocolo'}
                {fileCat === 'pdf' && 'Documento PDF'}
                {fileCat === 'word' && 'Documento Word (DOC/DOCX)'}
                {fileCat === 'excel' && 'Planilha Excel (XLS/XLSX)'}
                {fileCat === 'csv' && 'Tabela de Dados CSV'}
                {fileCat === 'other' && 'Arquivo Anexo'}
              </p>
            </div>
          </div>

          {/* 4 Botões Padronizados de Ação: [Visualizar] [Baixar] [Substituir] [Excluir] */}
          <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-200/70">
            {(fileCat === 'image' || fileCat === 'pdf') && (
              <button
                type="button"
                onClick={handleView}
                disabled={isLoadingViewUrl}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                title="Visualizar arquivo"
              >
                <Eye className="w-3.5 h-3.5 text-sky-600" />
                <span>Visualizar</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              disabled={isLoadingViewUrl}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              title="Baixar arquivo"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>{fileCat === 'word' || fileCat === 'excel' || fileCat === 'csv' ? 'Abrir / Baixar' : 'Baixar'}</span>
            </button>

            {!isSealed && (
              <>
                <button
                  type="button"
                  onClick={handleSubstitute}
                  disabled={disabled || isUploading}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                  title="Substituir arquivo por outro"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Substituir</span>
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={disabled || isUploading}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white hover:bg-red-50 text-red-600 border border-red-200 transition-colors cursor-pointer shadow-2xs"
                  title="Remover anexo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Estado: Nenhum arquivo anexado (Área de Upload) */
        <div
          onClick={handleOpenFileDialog}
          className={`p-5 rounded-2xl border-2 border-dashed border-slate-300 hover:border-sky-500 bg-slate-50/50 hover:bg-sky-50/30 transition-all text-center cursor-pointer space-y-2 ${
            disabled || isUploading || isSealed ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          {isUploading ? (
            <div className="py-2 flex flex-col items-center gap-2 text-sky-600">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs font-bold">Enviando com segurança para o Cloudflare R2...</span>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center mx-auto shadow-xs">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {buttonText}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  JPG, JPEG, PNG, WebP, PDF, DOC, DOCX, XLS, XLSX, CSV (máx. 10 MB)
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Alerta de erro */}
      {errorMessage && (
        <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Modal de Visualização Ampliada (Imagens e PDF) */}
      {isViewerOpen && viewerUrl && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-slate-800 truncate">
                  {currentFilename || 'Visualização do Anexo'}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-md">
                  {viewerType}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsViewerOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-100/60 min-h-[400px]">
              {viewerType === 'image' && (
                <img
                  src={viewerUrl}
                  alt={currentFilename || 'Anexo ampliado'}
                  className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-md"
                />
              )}

              {viewerType === 'pdf' && (
                <iframe
                  src={`${viewerUrl}#toolbar=0`}
                  title={currentFilename || 'PDF Viewer'}
                  className="w-full h-[75vh] rounded-xl border border-slate-200 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
