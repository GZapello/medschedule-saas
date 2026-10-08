import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { optimizeImageFile } from '../../utils/imageOptimizer';
import {
  Camera,
  Image as ImageIcon,
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Eye,
  RefreshCw,
  Search,
  Check,
  X,
  Plus,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  RotateCw,
  AlertCircle,
  Clock,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserPlus,
  SlidersHorizontal,
  Sparkles,
  Maximize2
} from 'lucide-react';

export interface ScannedPageItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  previewUrl: string;
  file: File;
  rotation: number;
  ignored: boolean;
}

export interface ExtractedEvolutionItem {
  date: string;
  time?: string;
  professional?: string;
  evolution: string;
  conduct?: string;
  page_number?: number;
}

export interface ExtractedRecordData {
  patient: {
    full_name: string;
    birth_date: string;
    cpf: string;
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
    city: string;
    state: string;
    zip_code: string;
    responsible: string;
    insurance_name: string;
    insurance_plan: string;
    insurance_card: string;
  };
  clinical: {
    chief_complaint: string;
    anamnesis: string;
    allergies: string;
    medications: string;
    vital_signs: string;
    triage: string;
    assessments: string;
    exams: string;
    diagnoses: string;
    conduct: string;
    notes: string;
  };
  evolutions: ExtractedEvolutionItem[];
  needs_review_fields: string[];
  uncertain_passages: string[];
  totalPagesAnalyzed: number;
}

export interface MatchedPatientInfo {
  id: string;
  full_name: string;
  cpf?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
}

export interface MedicalRecordScannerProps {
  onCancel: () => void;
  onSuccess: (result: { patientId: string; recordsCreated: number; isNewPatient: boolean }) => void;
  onNavigate?: (view: string) => void;
  initialMode?: 'camera' | 'photos' | 'document';
}

export const MedicalRecordScanner: React.FC<MedicalRecordScannerProps> = ({
  onCancel,
  onSuccess,
  onNavigate,
  initialMode = 'camera'
}) => {
  const { showToast } = useToast();

  // Estados principais do fluxo
  // 'capture' -> 'analyzing' -> 'review' -> 'completed'
  const [stage, setStage] = useState<'capture' | 'analyzing' | 'review' | 'completed'>('capture');

  // Páginas escaneadas em memória efêmera
  const [pages, setPages] = useState<ScannedPageItem[]>([]);
  const pagesRef = useRef<ScannedPageItem[]>([]);
  pagesRef.current = pages;

  // Página ativa no visualizador
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [viewerZoom, setViewerZoom] = useState<number>(1);

  // Estados de análise e progresso
  const [analysisProgressText, setAnalysisProgressText] = useState<string>('Iniciando análise com IA...');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Câmera integrada (WebCam modal)
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState<boolean>(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Inputs nativos ocultos
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const photosInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);

  // Dados extraídos e editáveis na revisão
  const [extractedData, setExtractedData] = useState<ExtractedRecordData | null>(null);
  const [matchedPatient, setMatchedPatient] = useState<MatchedPatientInfo | null>(null);
  const [isDuplicateDetected, setIsDuplicateDetected] = useState<boolean>(false);
  const [patientResolutionAction, setPatientResolutionAction] = useState<'link_existing' | 'create_new'>('link_existing');
  const [ignoredFields, setIgnoredFields] = useState<Set<string>>(new Set());

  // Aba ativa na revisão mobile ('original' | 'extracted')
  const [mobileReviewTab, setMobileReviewTab] = useState<'original' | 'extracted'>('extracted');
  const [reviewSectionTab, setReviewSectionTab] = useState<'patient' | 'clinical' | 'evolutions'>('patient');

  // Resultado final da importação
  const [completionResult, setCompletionResult] = useState<{
    patientId: string;
    patientName: string;
    recordsCreated: number;
    isNewPatient: boolean;
  } | null>(null);

  // REGRA CRÍTICA DE PRIVACIDADE / LGPD:
  // Ao desmontar o componente ou sair do fluxo, revoga TODOS os Object URLs da memória
  const purgeAllEphemeralUrls = useCallback(() => {
    pagesRef.current.forEach(p => {
      if (p.previewUrl) {
        try {
          URL.revokeObjectURL(p.previewUrl);
        } catch (_) {}
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      purgeAllEphemeralUrls();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [purgeAllEphemeralUrls]);

  // Se o modo inicial for 'camera' ou 'photos', aciona o picker correspondente
  useEffect(() => {
    if (pages.length === 0 && stage === 'capture') {
      if (initialMode === 'camera') {
        // Tenta acionar input da câmera ou modal
        // No celular, input capture="environment" é o método mais direto e nativo
      } else if (initialMode === 'photos') {
        photosInputRef.current?.click();
      } else if (initialMode === 'document') {
        documentInputRef.current?.click();
      }
    }
  }, [initialMode]);

  // Utilitário para ler arquivo como base64
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = err => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Adiciona arquivos de imagem/documento às páginas efêmeras
  const handleAddFiles = async (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList);
    if (rawFiles.length === 0) return;

    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    const newPages: ScannedPageItem[] = [];

    for (let i = 0; i < rawFiles.length; i++) {
      let f = rawFiles[i];
      let mime = f.type.toLowerCase();

      // Fallback para extensão se mimeType vier vazio
      if (!mime) {
        const ext = f.name.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') mime = 'application/pdf';
        else if (['jpg', 'jpeg'].includes(ext || '')) mime = 'image/jpeg';
        else if (ext === 'png') mime = 'image/png';
        else if (ext === 'webp') mime = 'image/webp';
      }

      if (!validMimes.includes(mime)) {
        showToast(`Arquivo "${f.name}" com formato não suportado. Aceitos: JPG, PNG, WebP e PDF.`, 'info');
        continue;
      }

      // Otimização leve de imagem (mantendo nitidez para OCR)
      if (mime.startsWith('image/')) {
        try {
          f = await optimizeImageFile(f, {
            maxWidth: 2000,
            maxHeight: 2000,
            quality: 0.88
          });
        } catch (_) {}
      }

      const previewUrl = URL.createObjectURL(f);
      newPages.push({
        id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        name: f.name || `Página ${pages.length + newPages.length + 1}`,
        size: f.size,
        mimeType: mime,
        previewUrl,
        file: f,
        rotation: 0,
        ignored: false
      });
    }

    if (newPages.length > 0) {
      setPages(prev => [...prev, ...newPages]);
      setActivePageIndex(pages.length);
      showToast(`${newPages.length} página(s) adicionada(s) para escaneamento.`, 'success');
    }
  };

  // Abertura da câmera ao vivo in-app
  const openLiveCamera = async () => {
    setIsLiveCameraOpen(true);
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: cameraFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('[Camera] Permissão ou webcam indisponível, abrindo captura nativa:', err?.message || err);
      setIsLiveCameraOpen(false);
      // Fallback transparente: aciona o input nativo com câmera traseira
      cameraInputRef.current?.click();
    }
  };

  const closeLiveCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    setIsLiveCameraOpen(false);
  };

  const toggleCameraFacingMode = async () => {
    const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(nextMode);
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (_) {}
  };

  // Captura foto do feed de vídeo
  const snapLivePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `foto_prontuario_pag_${pages.length + 1}.jpg`, { type: 'image/jpeg' });
      const previewUrl = URL.createObjectURL(file);
      const newPage: ScannedPageItem = {
        id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        name: `Foto Página ${pages.length + 1}`,
        size: file.size,
        mimeType: 'image/jpeg',
        previewUrl,
        file,
        rotation: 0,
        ignored: false
      };
      setPages(prev => [...prev, newPage]);
      setActivePageIndex(pages.length);
      showToast(`Página ${pages.length + 1} fotografada com sucesso!`, 'success');
    }, 'image/jpeg', 0.9);
  };

  // Manipulação de páginas (reordenar, excluir, girar)
  const removePage = (index: number) => {
    setPages(prev => {
      const target = prev[index];
      if (target?.previewUrl) {
        try { URL.revokeObjectURL(target.previewUrl); } catch (_) {}
      }
      const next = prev.filter((_, i) => i !== index);
      if (activePageIndex >= next.length) {
        setActivePageIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const movePage = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= pages.length) return;
    setPages(prev => {
      const copy = [...prev];
      const item = copy.splice(fromIndex, 1)[0];
      copy.splice(toIndex, 0, item);
      return copy;
    });
    setActivePageIndex(toIndex);
  };

  const rotateActivePage = () => {
    setPages(prev => {
      return prev.map((p, i) => {
        if (i === activePageIndex) {
          return { ...p, rotation: (p.rotation + 90) % 360 };
        }
        return p;
      });
    });
  };

  const toggleIgnoreActivePage = () => {
    setPages(prev => {
      return prev.map((p, i) => {
        if (i === activePageIndex) {
          return { ...p, ignored: !p.ignored };
        }
        return p;
      });
    });
  };

  // Envio para análise com IA (Gemini Multimodal)
  const handleStartAnalysis = async () => {
    const activePages = pages.filter(p => !p.ignored);
    if (activePages.length === 0) {
      showToast('Adicione ou reative pelo menos uma página para leitura.', 'info');
      return;
    }

    setStage('analyzing');
    setAnalysisProgressText(`Preparando ${activePages.length} página(s) para análise efêmera...`);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const filesPayload: Array<{ fileName: string; mimeType: string; base64: string }> = [];

      for (let i = 0; i < activePages.length; i++) {
        const page = activePages[i];
        setAnalysisProgressText(`Codificando página ${i + 1} de ${activePages.length}...`);
        const b64 = await readFileAsBase64(page.file);
        filesPayload.push({
          fileName: page.name,
          mimeType: page.mimeType,
          base64: b64
        });
      }

      setAnalysisProgressText(`Lendo com IA multimodal (Gemini)...`);

      const resp = await ApiClient.post<any>('/v1/import/medical-record/analyze', {
        files: filesPayload
      }, { signal: abortController.signal });

      if (!resp || !resp.success || !resp.extractedData) {
        throw new Error(resp?.error || 'Não foi possível extrair os dados clínicos.');
      }

      setExtractedData(resp.extractedData);
      setMatchedPatient(resp.matchedPatient || null);
      setIsDuplicateDetected(Boolean(resp.isDuplicate));
      setPatientResolutionAction(resp.isDuplicate ? 'link_existing' : 'create_new');
      setStage('review');
      setActivePageIndex(0);
      showToast('Prontuário lido com sucesso! Revise os campos extraídos.', 'success');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        showToast('Análise cancelada pelo usuário.', 'info');
        setStage('capture');
        return;
      }
      console.error('[MedicalRecordScanner] Erro na análise:', err);
      showToast(err.message || 'Falha ao processar imagens do prontuário com IA.', 'error');
      setStage('capture');
    } finally {
      abortControllerRef.current = null;
    }
  };

  // Cancelamento e descarte completo
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    purgeAllEphemeralUrls();
    setPages([]);
    setExtractedData(null);
    onCancel();
  };

  // Confirmação final da importação (Salva apenas dados estruturados)
  const handleConfirmImport = async () => {
    if (!extractedData) return;

    if (!extractedData.patient.full_name || !extractedData.patient.full_name.trim()) {
      showToast('O Nome Completo do Paciente é estritamente obrigatório.', 'error');
      setReviewSectionTab('patient');
      return;
    }

    try {
      const payload = {
        action: patientResolutionAction,
        existingPatientId: patientResolutionAction === 'link_existing' ? matchedPatient?.id : undefined,
        patient: extractedData.patient,
        clinical: extractedData.clinical,
        evolutions: extractedData.evolutions,
        ignoredFields: Array.from(ignoredFields)
      };

      const resp = await ApiClient.post<any>('/v1/import/medical-record/execute', payload);

      if (!resp || !resp.success) {
        throw new Error(resp?.error || 'Erro ao registrar prontuário.');
      }

      // REGRA CRÍTICA: Descarte IMEDIATO de todas as imagens temporárias
      purgeAllEphemeralUrls();
      setPages([]);

      setCompletionResult({
        patientId: resp.patientId,
        patientName: extractedData.patient.full_name,
        recordsCreated: resp.recordsCreated || 0,
        isNewPatient: resp.isNewPatient !== false
      });

      setStage('completed');
      showToast('Importação concluída. As imagens temporárias foram descartadas.', 'success');
      onSuccess(resp);
    } catch (err: any) {
      console.error('[MedicalRecordScanner] Erro na confirmação:', err);
      showToast(err.message || 'Erro ao salvar prontuário revisado.', 'error');
    }
  };

  // Alterna campo ignorado
  const toggleIgnoreField = (fieldName: string) => {
    setIgnoredFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldName)) {
        next.delete(fieldName);
      } else {
        next.add(fieldName);
      }
      return next;
    });
  };

  // Atualiza campo do paciente nos dados extraídos
  const updatePatientField = (field: keyof ExtractedRecordData['patient'], value: string) => {
    if (!extractedData) return;
    setExtractedData({
      ...extractedData,
      patient: {
        ...extractedData.patient,
        [field]: value
      }
    });
  };

  // Atualiza campo clínico nos dados extraídos
  const updateClinicalField = (field: keyof ExtractedRecordData['clinical'], value: string) => {
    if (!extractedData) return;
    setExtractedData({
      ...extractedData,
      clinical: {
        ...extractedData.clinical,
        [field]: value
      }
    });
  };

  // Atualiza evolução
  const updateEvolutionItem = (index: number, patch: Partial<ExtractedEvolutionItem>) => {
    if (!extractedData) return;
    const nextEvols = [...extractedData.evolutions];
    nextEvols[index] = { ...nextEvols[index], ...patch };
    setExtractedData({
      ...extractedData,
      evolutions: nextEvols
    });
  };

  const removeEvolutionItem = (index: number) => {
    if (!extractedData) return;
    setExtractedData({
      ...extractedData,
      evolutions: extractedData.evolutions.filter((_, i) => i !== index)
    });
  };

  const addManualEvolutionItem = () => {
    if (!extractedData) return;
    const newEv: ExtractedEvolutionItem = {
      date: new Date().toISOString().slice(0, 10),
      time: '09:00',
      professional: '',
      evolution: '',
      conduct: '',
      page_number: 1
    };
    setExtractedData({
      ...extractedData,
      evolutions: [...extractedData.evolutions, newEv]
    });
  };

  const activePage = pages[activePageIndex];

  // --------------------------------------------------------------------------
  // RENDER: MODAL DE CÂMERA AO VIVO
  // --------------------------------------------------------------------------
  const renderLiveCameraModal = () => {
    if (!isLiveCameraOpen) return null;
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-between p-4">
        {/* Barra superior */}
        <div className="w-full max-w-lg flex items-center justify-between text-white py-2">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-teal-400" />
            <span className="text-sm font-semibold">Fotografar Prontuário</span>
          </div>
          <button
            onClick={closeLiveCamera}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder da câmera */}
        <div className="relative w-full max-w-lg aspect-3/4 max-h-[70vh] bg-black rounded-2xl overflow-hidden border-2 border-teal-500/50 shadow-2xl flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="w-full h-full object-cover"
          />
          {/* Mira / Guia visual do documento */}
          <div className="absolute inset-4 border-2 border-white/30 rounded-xl pointer-events-none flex flex-col justify-between p-2">
            <div className="flex justify-between text-[10px] text-teal-300 font-mono">
              <span>CANTO SUPERIOR</span>
              <span>PÁGINA {pages.length + 1}</span>
            </div>
            <div className="text-center text-xs text-white/70 bg-black/40 py-1 rounded-md">
              Posicione a folha de forma plana e bem iluminada
            </div>
          </div>
        </div>

        {/* Controles da câmera */}
        <div className="w-full max-w-lg flex items-center justify-around py-4">
          <button
            type="button"
            onClick={toggleCameraFacingMode}
            className="p-3 rounded-full bg-white/20 hover:bg-white/30 text-white transition-transform active:scale-95"
            title="Virar câmera (Traseira/Frontal)"
          >
            <RotateCw className="w-6 h-6" />
          </button>

          {/* Botão de Disparo */}
          <button
            type="button"
            onClick={snapLivePhoto}
            className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center bg-teal-500 hover:bg-teal-400 text-white shadow-lg transition-transform active:scale-90"
            title="Tirar Foto da Página"
          >
            <div className="w-14 h-14 rounded-full bg-white/30" />
          </button>

          <button
            type="button"
            onClick={closeLiveCamera}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold"
          >
            Concluir ({pages.length})
          </button>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // ETAPA 1: CAPTURA & GERENCIAMENTO DE PÁGINAS
  // --------------------------------------------------------------------------
  if (stage === 'capture') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
        {renderLiveCameraModal()}

        {/* Inputs Ocultos */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={e => {
            if (e.target.files) handleAddFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={photosInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => {
            if (e.target.files) handleAddFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={documentInputRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => {
            if (e.target.files) handleAddFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-teal-50 text-teal-600">
                <Camera className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-slate-900">
                Importação de Prontuário por Foto / Documento
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Escaneie ou envie imagens/PDFs de prontuários impressos ou manuscritos para extração inteligente por IA.
            </p>
          </div>

          <button
            onClick={handleCancel}
            className="self-start sm:self-center px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Voltar para Planilhas
          </button>
        </div>

        {/* Selo LGPD / Privacidade em Destaque */}
        <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
          <div className="text-xs text-teal-900 space-y-1">
            <span className="font-bold">Privacidade & Processamento 100% Efêmero (Sem Armazenar as Fotos)</span>
            <p className="text-teal-800 leading-relaxed">
              As imagens são processadas exclusivamente em memória temporária para extração dos dados e visualização lado a lado.
              Elas <strong>NUNCA</strong> são armazenadas no banco de dados, em servidores em nuvem (R2) ou no prontuário.
              Ao concluir ou cancelar, os arquivos originais são descartados de forma imediata e definitiva.
            </p>
          </div>
        </div>

        {/* Três Opções de Ação Direta */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={openLiveCamera}
            className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/30 hover:bg-teal-50 hover:border-teal-500 transition-all text-center group cursor-pointer"
          >
            <div className="p-3 rounded-full bg-teal-500 text-white mb-2 shadow-xs group-hover:scale-105 transition-transform">
              <Camera className="w-6 h-6" />
            </div>
            <span className="text-sm font-bold text-slate-900">Fotografar prontuário</span>
            <span className="text-[11px] text-slate-500 mt-0.5">Abre a câmera traseira do celular</span>
          </button>

          <button
            type="button"
            onClick={() => photosInputRef.current?.click()}
            className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/30 hover:bg-sky-50 hover:border-sky-500 transition-all text-center group cursor-pointer"
          >
            <div className="p-3 rounded-full bg-sky-500 text-white mb-2 shadow-xs group-hover:scale-105 transition-transform">
              <ImageIcon className="w-6 h-6" />
            </div>
            <span className="text-sm font-bold text-slate-900">Enviar fotos</span>
            <span className="text-[11px] text-slate-500 mt-0.5">Selecione imagens JPG, PNG ou WebP</span>
          </button>

          <button
            type="button"
            onClick={() => documentInputRef.current?.click()}
            className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/30 hover:bg-indigo-50 hover:border-indigo-500 transition-all text-center group cursor-pointer"
          >
            <div className="p-3 rounded-full bg-indigo-500 text-white mb-2 shadow-xs group-hover:scale-105 transition-transform">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-sm font-bold text-slate-900">Enviar documento</span>
            <span className="text-[11px] text-slate-500 mt-0.5">Prontuário digitalizado ou PDF</span>
          </button>
        </div>

        {/* Gerenciador de Páginas Capturadas */}
        {pages.length > 0 ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>Páginas para análise ({pages.length})</span>
                <span className="text-xs font-normal text-slate-400">
                  {pages.filter(p => !p.ignored).length} ativa(s)
                </span>
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openLiveCamera}
                  className="px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Fotografar mais
                </button>
                <button
                  type="button"
                  onClick={() => photosInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar fotos/PDF
                </button>
              </div>
            </div>

            {/* Grid / Carrossel de Miniaturas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {pages.map((p, idx) => (
                <div
                  key={p.id}
                  className={`relative group rounded-xl border p-2 flex flex-col justify-between transition-all ${
                    p.ignored
                      ? 'border-slate-200 bg-slate-100/70 opacity-60'
                      : idx === activePageIndex
                      ? 'border-teal-500 bg-teal-50/30 ring-2 ring-teal-500/20 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {/* Badge de número de página */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      Pág. {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePage(idx)}
                      className="text-slate-400 hover:text-red-500 p-0.5 transition-colors"
                      title="Excluir página"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Thumbnail / Prévia */}
                  <div
                    onClick={() => setActivePageIndex(idx)}
                    className="w-full aspect-3/4 rounded-lg bg-slate-50 overflow-hidden flex items-center justify-center cursor-pointer border border-slate-200"
                  >
                    {p.mimeType === 'application/pdf' ? (
                      <div className="flex flex-col items-center gap-1 text-slate-400 p-2 text-center">
                        <FileText className="w-8 h-8 text-rose-500" />
                        <span className="text-[10px] font-medium text-slate-600 truncate max-w-[80px]">
                          {p.name}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={p.previewUrl}
                        alt={`Página ${idx + 1}`}
                        className="w-full h-full object-cover transition-transform"
                        style={{ transform: `rotate(${p.rotation}deg)` }}
                      />
                    )}
                  </div>

                  {/* Ações de reordenar */}
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => movePage(idx, idx - 1)}
                      className="disabled:opacity-20 hover:text-teal-600 p-0.5"
                      title="Mover para esquerda"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPages(prev => prev.map((item, i) => i === idx ? { ...item, ignored: !item.ignored } : item));
                      }}
                      className={`text-[10px] font-medium px-1 rounded ${p.ignored ? 'text-amber-700 bg-amber-100' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {p.ignored ? 'Ignorada' : 'Ativa'}
                    </button>

                    <button
                      type="button"
                      disabled={idx === pages.length - 1}
                      onClick={() => movePage(idx, idx + 1)}
                      className="disabled:opacity-20 hover:text-teal-600 p-0.5"
                      title="Mover para direita"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Ação principal: Iniciar Análise */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCancel}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar e Descartar
              </button>

              <button
                type="button"
                onClick={handleStartAnalysis}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-teal-200" />
                <span>Analisar com IA ({pages.filter(p => !p.ignored).length} página(s))</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 border border-slate-100 rounded-xl bg-slate-50/50">
            <p className="text-xs text-slate-400">
              Nenhuma página capturada ainda. Selecione uma das opções acima para começar.
            </p>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // ETAPA 2: ANALISANDO COM IA MULTIMODAL (SCANNER UX)
  // --------------------------------------------------------------------------
  if (stage === 'analyzing') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-10 flex flex-col items-center justify-center text-center space-y-6 min-h-[400px]">
        {/* Animação de Scanner */}
        <div className="relative w-24 h-24 rounded-2xl bg-teal-50 border-2 border-teal-200 flex items-center justify-center overflow-hidden shadow-inner">
          <FileText className="w-12 h-12 text-teal-600 animate-pulse" />
          <div className="absolute inset-x-0 h-1 bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.8)] animate-bounce" />
        </div>

        <div className="space-y-2 max-w-md">
          <h3 className="text-base font-bold text-slate-900">Analisando Prontuário com Inteligência Artificial</h3>
          <p className="text-xs text-teal-700 font-medium">{analysisProgressText}</p>
          <p className="text-[11px] text-slate-400">
            Lendo dados cadastrais, queixa, anamnese, exames e separando cada evolução histórica por data.
          </p>
        </div>

        {/* Lembrete de Privacidade */}
        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
          <span>Processamento efêmero em memória. Nenhuma foto será armazenada.</span>
        </div>

        <button
          type="button"
          onClick={() => {
            if (abortControllerRef.current) abortControllerRef.current.abort();
            setStage('capture');
          }}
          className="px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
        >
          Cancelar análise
        </button>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // ETAPA 3: REVISÃO OBRIGATÓRIA (LADO A LADO: ORIGINAL TEMPORÁRIO | DADOS EXTRAÍDOS)
  // --------------------------------------------------------------------------
  if (stage === 'review' && extractedData) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
        {/* Cabeçalho da Revisão */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-50 text-teal-600">
                <FileText className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Revisão Obrigatória do Prontuário
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare a imagem original com os dados extraídos pela IA. Edite os campos necessários antes de confirmar.
            </p>
          </div>

          {/* Alternador Mobile (Original vs Dados) */}
          <div className="sm:hidden flex rounded-xl bg-slate-100 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setMobileReviewTab('original')}
              className={`flex-1 py-1.5 px-3 rounded-lg transition-colors ${mobileReviewTab === 'original' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-500'}`}
            >
              Original ({pages.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileReviewTab('extracted')}
              className={`flex-1 py-1.5 px-3 rounded-lg transition-colors ${mobileReviewTab === 'extracted' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-500'}`}
            >
              Dados Extraídos
            </button>
          </div>
        </div>

        {/* Alerta de Caligrafia / Trechos Inseguros [Revisar] */}
        {(extractedData.needs_review_fields.length > 0 || extractedData.uncertain_passages.length > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <span className="font-bold">Atenção para caligrafia manuscrita:</span> Alguns trechos com caligrafia médica incerta foram sinalizados com a marcação <span className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded text-amber-950">[Revisar]</span> para sua conferência na imagem original.
            </div>
          </div>
        )}

        {/* Alerta e Resolução de Duplicata (Paciente Existente) */}
        {isDuplicateDetected && matchedPatient && (
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-sky-950">
                  Possível paciente já cadastrado no sistema
                </h4>
                <p className="text-xs text-sky-800 mt-0.5">
                  Encontramos cadastro correspondente na clínica para: <strong className="font-bold text-sky-950">{matchedPatient.full_name}</strong>
                  {matchedPatient.cpf ? ` · CPF: ${matchedPatient.cpf}` : ''}
                  {matchedPatient.phone ? ` · Tel: ${matchedPatient.phone}` : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPatientResolutionAction('link_existing')}
                className={`flex-1 p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  patientResolutionAction === 'link_existing'
                    ? 'border-sky-500 bg-sky-600 text-white shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-sky-50/50'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                <span>Vincular ao paciente existente</span>
              </button>

              <button
                type="button"
                onClick={() => setPatientResolutionAction('create_new')}
                className={`flex-1 p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  patientResolutionAction === 'create_new'
                    ? 'border-slate-800 bg-slate-900 text-white shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Criar novo paciente</span>
              </button>
            </div>
          </div>
        )}

        {/* LADO A LADO: ORIGINAL TEMPORÁRIO (ESQUERDA) | DADOS EXTRAÍDOS (DIREITA) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* COLUNA ESQUERDA: ORIGINAL TEMPORÁRIO */}
          <div className={`lg:col-span-5 space-y-3 ${mobileReviewTab === 'original' ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3 shadow-lg">
              {/* Barra de navegação e zoom da imagem */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-teal-400">Página {activePageIndex + 1} de {pages.length}</span>
                  {activePage?.ignored && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-medium">
                      Ignorada
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewerZoom(z => Math.max(0.6, z - 0.2))}
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-300"
                    title="Diminuir zoom"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-mono text-slate-400 w-10 text-center">
                    {Math.round(viewerZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewerZoom(z => Math.min(3, z + 0.2))}
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-300"
                    title="Aumentar zoom"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={rotateActivePage}
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-300"
                    title="Girar 90 graus"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Viewport da imagem com overflow scroll */}
              <div className="w-full aspect-3/4 max-h-[550px] bg-black/60 rounded-xl overflow-auto flex items-center justify-center p-2 border border-slate-800">
                {activePage?.mimeType === 'application/pdf' ? (
                  <iframe
                    src={activePage.previewUrl}
                    title="Documento PDF"
                    className="w-full h-full rounded-lg"
                  />
                ) : (
                  <img
                    src={activePage?.previewUrl}
                    alt={`Página ${activePageIndex + 1}`}
                    className="max-w-none transition-transform origin-center"
                    style={{
                      transform: `scale(${viewerZoom}) rotate(${activePage?.rotation || 0}deg)`,
                      maxHeight: viewerZoom <= 1 ? '100%' : 'none'
                    }}
                  />
                )}
              </div>

              {/* Controles de página e aviso de descarte */}
              <div className="flex items-center justify-between text-xs pt-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={activePageIndex === 0}
                    onClick={() => setActivePageIndex(i => Math.max(0, i - 1))}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={activePageIndex === pages.length - 1}
                    onClick={() => setActivePageIndex(i => Math.min(pages.length - 1, i + 1))}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30"
                  >
                    Próxima
                  </button>
                </div>

                <button
                  type="button"
                  onClick={toggleIgnoreActivePage}
                  className={`text-[11px] px-2 py-1 rounded transition-colors ${
                    activePage?.ignored
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {activePage?.ignored ? 'Reativar página' : 'Ignorar esta página'}
                </button>
              </div>

              <div className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3 text-teal-400" />
                <span>Arquivo temporário em memória (será excluído ao concluir)</span>
              </div>
            </div>
          </div>

          {/* COLUNA DIREITA: DADOS EXTRAÍDOS (100% EDITÁVEIS) */}
          <div className={`lg:col-span-7 space-y-4 ${mobileReviewTab === 'extracted' ? 'block' : 'hidden lg:block'}`}>
            {/* Navegador de Abas das Seções */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setReviewSectionTab('patient')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  reviewSectionTab === 'patient'
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                1. Cadastro do Paciente
              </button>

              <button
                type="button"
                onClick={() => setReviewSectionTab('clinical')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  reviewSectionTab === 'clinical'
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                2. Anamnese & Clínico
              </button>

              <button
                type="button"
                onClick={() => setReviewSectionTab('evolutions')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  reviewSectionTab === 'evolutions'
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>3. Evoluções ({extractedData.evolutions.length})</span>
                {extractedData.evolutions.length > 1 && (
                  <span className="text-[10px] bg-teal-200 text-teal-800 px-1.5 py-0.2 rounded-full">
                    Múltiplos
                  </span>
                )}
              </button>
            </div>

            {/* SEÇÃO 1: CADASTRO DO PACIENTE */}
            {reviewSectionTab === 'patient' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nome Completo do Paciente *
                    </label>
                    <input
                      type="text"
                      value={extractedData.patient.full_name}
                      onChange={e => updatePatientField('full_name', e.target.value)}
                      placeholder="Ex: João da Silva"
                      className="w-full text-xs font-semibold px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      CPF / Documento
                    </label>
                    <input
                      type="text"
                      value={extractedData.patient.cpf}
                      onChange={e => updatePatientField('cpf', e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Data de Nascimento
                    </label>
                    <input
                      type="text"
                      value={extractedData.patient.birth_date}
                      onChange={e => updatePatientField('birth_date', e.target.value)}
                      placeholder="DD/MM/AAAA ou AAAA-MM-DD"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Telefone / Celular
                    </label>
                    <input
                      type="text"
                      value={extractedData.patient.phone}
                      onChange={e => updatePatientField('phone', e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      WhatsApp
                    </label>
                    <input
                      type="text"
                      value={extractedData.patient.whatsapp}
                      onChange={e => updatePatientField('whatsapp', e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={extractedData.patient.email}
                      onChange={e => updatePatientField('email', e.target.value)}
                      placeholder="paciente@exemplo.com"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Responsável Legal / Emergência
                    </label>
                    <input
                      type="text"
                      value={extractedData.patient.responsible}
                      onChange={e => updatePatientField('responsible', e.target.value)}
                      placeholder="Nome do responsável"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Endereço Completo
                    </label>
                    <input
                      type="text"
                      value={extractedData.patient.address}
                      onChange={e => updatePatientField('address', e.target.value)}
                      placeholder="Rua, número, complemento"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Cidade
                    </label>
                    <input
                      type="text"
                      value={extractedData.patient.city}
                      onChange={e => updatePatientField('city', e.target.value)}
                      placeholder="Cidade"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Estado (UF)
                      </label>
                      <input
                        type="text"
                        value={extractedData.patient.state}
                        onChange={e => updatePatientField('state', e.target.value)}
                        placeholder="UF"
                        className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        CEP
                      </label>
                      <input
                        type="text"
                        value={extractedData.patient.zip_code}
                        onChange={e => updatePatientField('zip_code', e.target.value)}
                        placeholder="00000-000"
                        className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Convênio / Operadora
                    </label>
                    <input
                      type="text"
                      value={extractedData.patient.insurance_name}
                      onChange={e => updatePatientField('insurance_name', e.target.value)}
                      placeholder="Ex: Unimed, Bradesco"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Carteirinha do Convênio
                    </label>
                    <input
                      type="text"
                      value={extractedData.patient.insurance_card}
                      onChange={e => updatePatientField('insurance_card', e.target.value)}
                      placeholder="Número da carteirinha"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 2: ANAMNESE & CLÍNICO */}
            {reviewSectionTab === 'clinical' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span>Queixa Principal / Motivo</span>
                      {extractedData.clinical.chief_complaint?.includes('[Revisar]') && (
                        <span className="text-[10px] text-amber-700 bg-amber-100 px-1 rounded font-bold">
                          ⚠️ Revisar
                        </span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleIgnoreField('chief_complaint')}
                      className={`text-[10px] ${ignoredFields.has('chief_complaint') ? 'text-amber-700 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {ignoredFields.has('chief_complaint') ? 'Campo Ignorado' : 'Ignorar campo'}
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    disabled={ignoredFields.has('chief_complaint')}
                    value={extractedData.clinical.chief_complaint}
                    onChange={e => updateClinicalField('chief_complaint', e.target.value)}
                    className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none disabled:opacity-40"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span>Anamnese / Histórico Clínico</span>
                      {extractedData.clinical.anamnesis?.includes('[Revisar]') && (
                        <span className="text-[10px] text-amber-700 bg-amber-100 px-1 rounded font-bold">
                          ⚠️ Revisar
                        </span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleIgnoreField('anamnesis')}
                      className={`text-[10px] ${ignoredFields.has('anamnesis') ? 'text-amber-700 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {ignoredFields.has('anamnesis') ? 'Campo Ignorado' : 'Ignorar campo'}
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    disabled={ignoredFields.has('anamnesis')}
                    value={extractedData.clinical.anamnesis}
                    onChange={e => updateClinicalField('anamnesis', e.target.value)}
                    className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none disabled:opacity-40"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">Alergias / Alertas</label>
                      <button
                        type="button"
                        onClick={() => toggleIgnoreField('allergies')}
                        className={`text-[10px] ${ignoredFields.has('allergies') ? 'text-amber-700 font-bold' : 'text-slate-400'}`}
                      >
                        {ignoredFields.has('allergies') ? 'Ignorado' : 'Ignorar'}
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      disabled={ignoredFields.has('allergies')}
                      value={extractedData.clinical.allergies}
                      onChange={e => updateClinicalField('allergies', e.target.value)}
                      placeholder="Nega alergias ou listar substâncias"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none disabled:opacity-40"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">Medicamentos em Uso</label>
                      <button
                        type="button"
                        onClick={() => toggleIgnoreField('medications')}
                        className={`text-[10px] ${ignoredFields.has('medications') ? 'text-amber-700 font-bold' : 'text-slate-400'}`}
                      >
                        {ignoredFields.has('medications') ? 'Ignorado' : 'Ignorar'}
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      disabled={ignoredFields.has('medications')}
                      value={extractedData.clinical.medications}
                      onChange={e => updateClinicalField('medications', e.target.value)}
                      placeholder="Medicamentos de uso contínuo"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none disabled:opacity-40"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Sinais Vitais (PA, FC, Temp, Peso, etc.)
                    </label>
                    <input
                      type="text"
                      value={extractedData.clinical.vital_signs}
                      onChange={e => updateClinicalField('vital_signs', e.target.value)}
                      placeholder="Ex: PA: 120/80 mmHg, FC: 75 bpm"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Diagnósticos / Hipóteses (CID)
                    </label>
                    <input
                      type="text"
                      value={extractedData.clinical.diagnoses}
                      onChange={e => updateClinicalField('diagnoses', e.target.value)}
                      placeholder="Diagnósticos expressamente descritos"
                      className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Exames Complementares & Avaliações
                  </label>
                  <textarea
                    rows={2}
                    value={extractedData.clinical.exams}
                    onChange={e => updateClinicalField('exams', e.target.value)}
                    placeholder="Resultados ou laudos transcritos do prontuário"
                    className="w-full text-xs px-3 py-2 border rounded-xl bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* SEÇÃO 3: MÚLTIPLOS ATENDIMENTOS & EVOLUÇÕES POR DATA */}
            {reviewSectionTab === 'evolutions' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Cada consulta/atendimento identificado no prontuário será registrado como uma entrada individual na linha do tempo do paciente.
                  </p>
                  <button
                    type="button"
                    onClick={addManualEvolutionItem}
                    className="px-2.5 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar consulta
                  </button>
                </div>

                {extractedData.evolutions.length === 0 ? (
                  <div className="text-center py-6 border border-dashed rounded-xl text-xs text-slate-400">
                    Nenhuma evolução datada separadamente. A anamnese geral será salva como prontuário inicial.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {extractedData.evolutions.map((ev, evIdx) => (
                      <div
                        key={evIdx}
                        className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">
                              Atendimento #{evIdx + 1}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              (Pág. {ev.page_number || '1'})
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeEvolutionItem(evIdx)}
                            className="text-slate-400 hover:text-red-500 p-0.5"
                            title="Remover atendimento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              Data da Consulta
                            </label>
                            <input
                              type="text"
                              value={ev.date}
                              onChange={e => updateEvolutionItem(evIdx, { date: e.target.value })}
                              placeholder="AAAA-MM-DD"
                              className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                              Profissional / Responsável
                            </label>
                            <input
                              type="text"
                              value={ev.professional || ''}
                              onChange={e => updateEvolutionItem(evIdx, { professional: e.target.value })}
                              placeholder="Nome do médico/profissional"
                              className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                            Anotações Clínicas / Evolução
                          </label>
                          <textarea
                            rows={2}
                            value={ev.evolution}
                            onChange={e => updateEvolutionItem(evIdx, { evolution: e.target.value })}
                            placeholder="Descrição do atendimento"
                            className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                            Conduta / Prescrição
                          </label>
                          <textarea
                            rows={1}
                            value={ev.conduct || ''}
                            onChange={e => updateEvolutionItem(evIdx, { conduct: e.target.value })}
                            placeholder="Conduta ou orientações dadas na consulta"
                            className="w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white border-slate-300 focus:border-teal-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* BARRA DE AÇÕES INFERIOR */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleCancel}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar e Descartar
              </button>

              <button
                type="button"
                onClick={handleConfirmImport}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar Importação de Prontuário</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // ETAPA 4: CONCLUSÃO & DESCARTE DEFINITIVO GARANTIDO
  // --------------------------------------------------------------------------
  if (stage === 'completed' && completionResult) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-10 flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center shadow-xs">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div className="space-y-2 max-w-md">
          <h3 className="text-lg font-bold text-slate-900">Importação Concluída com Sucesso!</h3>
          <p className="text-xs text-slate-600">
            Os dados clínicos e cadastrais do paciente foram salvos e integrados ao sistema.
          </p>
        </div>

        {/* Garantia LGPD de Descarte das Imagens */}
        <div className="bg-teal-50/80 border border-teal-200 rounded-xl p-4 max-w-md w-full flex items-center gap-3 text-left">
          <ShieldCheck className="w-6 h-6 text-teal-700 shrink-0" />
          <div className="text-xs text-teal-900">
            <span className="font-bold">Descarte de Imagens Concluído:</span>
            <p className="text-teal-800 text-[11px] mt-0.5">
              Todas as imagens e documentos temporários foram descartados de forma definitiva da memória.
            </p>
          </div>
        </div>

        {/* Resumo do que foi gravado */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-w-md w-full text-xs text-left space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Paciente:</span>
            <span className="font-bold text-slate-800">{completionResult.patientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Tipo de operação:</span>
            <span className="font-semibold text-slate-700">
              {completionResult.isNewPatient ? 'Novo Paciente Cadastrado' : 'Vinculado a Paciente Existente'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Atendimentos na linha do tempo:</span>
            <span className="font-bold text-teal-700">{completionResult.recordsCreated}</span>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('records')}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-xs"
            >
              Ver Prontuário do Paciente
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setStage('capture');
              setCompletionResult(null);
              setPages([]);
              setExtractedData(null);
            }}
            className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
          >
            Importar Outro Prontuário
          </button>
        </div>
      </div>
    );
  }

  return null;
};
