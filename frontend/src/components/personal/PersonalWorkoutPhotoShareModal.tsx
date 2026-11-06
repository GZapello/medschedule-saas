import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Share2,
  Download,
  Copy,
  Check,
  Sparkles,
  Trophy,
  Flame,
  X,
  RefreshCw,
  Trash2,
  Instagram,
  Smartphone,
  Square,
  Type,
  Sliders,
  Dumbbell,
  SwitchCamera
} from 'lucide-react';
import { downloadBlob } from '../../utils/download';
import { POST_WORKOUT_SHARE_QUOTES, ShareWorkoutQuote } from './studentMotivationalQuotes';

export interface WorkoutPRItem {
  exercise_name: string;
  exercise_id?: string | null;
  previous_max: number;
  new_pr: number;
  evolution_kg: number;
}

export interface CompletedWorkoutContext {
  title: string;
  division?: string;
  muscleGroups?: string[];
  durationMinutes: number;
  completedExercisesCount: number;
  totalExercisesCount: number;
  completedAt?: string;
}

export interface PersonalWorkoutPhotoShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  clinicName?: string;
  personalName?: string;
  completedWorkoutDates?: string[];
  workoutContext: CompletedWorkoutContext;
  newPRs: WorkoutPRItem[];
  initialMode?: 'default' | 'camera' | 'gallery';
  initialPhotoUrl?: string | null;
}

export interface WeekTrainedDayStatus {
  index: number;
  shortLabel: string;
  fullLabel: string;
  trained: boolean;
}

const WEEK_DAYS_CONFIG: Array<{ index: number; shortLabel: string; fullLabel: string }> = [
  { index: 0, shortLabel: 'SEG', fullLabel: 'Segunda' },
  { index: 1, shortLabel: 'TER', fullLabel: 'Terça' },
  { index: 2, shortLabel: 'QUA', fullLabel: 'Quarta' },
  { index: 3, shortLabel: 'QUI', fullLabel: 'Quinta' },
  { index: 4, shortLabel: 'SEX', fullLabel: 'Sexta' },
  { index: 5, shortLabel: 'SÁB', fullLabel: 'Sábado' },
  { index: 6, shortLabel: 'DOM', fullLabel: 'Domingo' }
];

function parseWorkoutCompletedDate(raw: string): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Data simples YYYY-MM-DD interpretada no fuso horário local
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const y = Number(dateOnlyMatch[1]);
    const m = Number(dateOnlyMatch[2]) - 1;
    const d = Number(dateOnlyMatch[3]);
    return new Date(y, m, d, 12, 0, 0, 0);
  }

  // Formato SQLite datetime('now'): "YYYY-MM-DD HH:MM:SS" (UTC)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed)) {
    const d = new Date(trimmed.replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Calcula os dias treinados na semana atual (de segunda a domingo) respeitando o fuso horário local.
 * Deduplica múltiplos treinos realizados no mesmo dia.
 */
export function computeCurrentWeekTrainedDays(
  completedDates: string[] = [],
  referenceDate: Date = new Date()
): WeekTrainedDayStatus[] {
  const refDay = referenceDate.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  const mondayOffset = refDay === 0 ? -6 : 1 - refDay;

  const weekStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + mondayOffset,
    0,
    0,
    0,
    0
  );
  const weekEnd = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + mondayOffset + 6,
    23,
    59,
    59,
    999
  );

  const trainedIndices = new Set<number>();

  for (const raw of completedDates) {
    const dt = parseWorkoutCompletedDate(raw);
    if (!dt) continue;
    const ms = dt.getTime();
    if (ms >= weekStart.getTime() && ms <= weekEnd.getTime()) {
      const jsDay = dt.getDay();
      const mondayBasedIdx = jsDay === 0 ? 6 : jsDay - 1;
      trainedIndices.add(mondayBasedIdx);
    }
  }

  return WEEK_DAYS_CONFIG.map(day => ({
    ...day,
    trained: trainedIndices.has(day.index)
  }));
}

type ArtFormat = 'story' | 'square';
type ThemePreset = 'emerald' | 'midnight' | 'gold';

const RECORD_BADGE_PRESETS = [
  { id: 'pr-batido', label: 'PR batido', prefix: 'PR BATIDO' },
  { id: 'novo-recorde', label: 'Novo recorde pessoal', prefix: 'NOVO RECORDE PESSOAL' },
  { id: 'mais-carga', label: 'Mais carga', prefix: 'EVOLUÇÃO DE CARGA' },
  { id: 'mais-reps', label: 'Mais repetições', prefix: 'MAIS REPETIÇÕES' },
  { id: 'mais-tempo', label: 'Mais tempo', prefix: 'RESISTÊNCIA MÁXIMA' },
  { id: 'melhor-desempenho', label: 'Melhor desempenho', prefix: 'MELHOR DESEMPENHO' }
];

const OFFICIAL_ZEMDA_LOGO_SRC = '/brand/zemda-logo.png';
let cachedZemdaLogoElement: HTMLImageElement | null = null;
let cachedZemdaLogoTransparentCanvas: HTMLCanvasElement | null = null;
let cachedZemdaLogoPromise: Promise<HTMLImageElement | null> | null = null;

/**
 * Garante que a logo oficial do Zemda tenha fundo 100% transparente (sem fundo branco)
 * e excelente legibilidade sobre fundos escuros e claros, preservando proporções e ícone originais.
 */
function buildTransparentZemdaLogoCanvas(img: HTMLImageElement): HTMLCanvasElement | null {
  if (cachedZemdaLogoTransparentCanvas) return cachedZemdaLogoTransparentCanvas;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  if (!octx) return null;

  octx.drawImage(img, 0, 0, w, h);
  try {
    const imageData = octx.getImageData(0, 0, w, h);
    const d = imageData.data;
    const textStartX = Math.floor(w * 0.32);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = d[idx];
        const g = d[idx + 1];
        const b = d[idx + 2];
        const a = d[idx + 3];
        if (a === 0) continue;

        // Remove qualquer resquício de fundo branco (mantendo o círculo menta do ícone)
        if (r > 242 && g > 245 && b > 245) {
          d[idx + 3] = 0;
          continue;
        }

        // Ilumina suavemente as letras "Zemda" (originalmente petróleo escuro) para leitura nítida sem caixa branca
        if (x >= textStartX && g < 140 && r < 40) {
          d[idx] = 226;     // #e2f8f5 / #5eead4
          d[idx + 1] = 248;
          d[idx + 2] = 245;
        }
      }
    }
    octx.putImageData(imageData, 0, 0);
  } catch {
    // Caso o navegador restrinja getImageData, mantém o desenho original transparente
  }

  cachedZemdaLogoTransparentCanvas = off;
  return off;
}

function loadOfficialZemdaLogo(): Promise<HTMLImageElement | null> {
  if (cachedZemdaLogoElement && cachedZemdaLogoElement.complete && cachedZemdaLogoElement.naturalWidth > 0) {
    buildTransparentZemdaLogoCanvas(cachedZemdaLogoElement);
    return Promise.resolve(cachedZemdaLogoElement);
  }
  if (cachedZemdaLogoPromise) {
    return cachedZemdaLogoPromise;
  }
  cachedZemdaLogoPromise = new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      cachedZemdaLogoElement = img;
      buildTransparentZemdaLogoCanvas(img);
      resolve(img);
    };
    img.onerror = () => {
      cachedZemdaLogoPromise = null;
      resolve(null);
    };
    img.src = OFFICIAL_ZEMDA_LOGO_SRC;
  });
  return cachedZemdaLogoPromise;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 4
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) {
        break;
      }
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    const remainingIdx = words.slice(lines.join(' ').split(/\s+/).filter(Boolean).length).join(' ');
    lines.push(lines.length === maxLines - 1 && remainingIdx.length > currentLine.length ? remainingIdx : currentLine);
  }
  return lines.slice(0, maxLines);
}

export const PersonalWorkoutPhotoShareModal: React.FC<PersonalWorkoutPhotoShareModalProps> = ({
  isOpen,
  onClose,
  studentName,
  clinicName = 'ZemdaPersonal',
  personalName = '',
  completedWorkoutDates,
  workoutContext,
  newPRs,
  initialMode = 'default',
  initialPhotoUrl = null
}) => {
  // Formato da arte: Story (9:16) ou Quadrado/Feed (1:1)
  const [format, setFormat] = useState<ArtFormat>('story');
  const [theme, setTheme] = useState<ThemePreset>('emerald');

  // Foto do aluno
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoImageElement, setPhotoImageElement] = useState<HTMLImageElement | null>(null);
  const [photoZoom, setPhotoZoom] = useState<number>(1);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.55);

  // Câmera ao vivo no navegador
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Inputs de arquivo nativos (galeria e captura mobile)
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraCaptureInputRef = useRef<HTMLInputElement | null>(null);

  // Logo do Zemda pré-carregada para o Canvas
  const [zemdaLogoImg, setZemdaLogoImg] = useState<HTMLImageElement | null>(null);

  // Frases prontas e personalizada
  const [quoteFilter, setQuoteFilter] = useState<'all' | 'motivacional' | 'divertido'>('all');
  const [selectedPresetQuote, setSelectedPresetQuote] = useState<string>(POST_WORKOUT_SHARE_QUOTES[0].text);
  const [customQuote, setCustomQuote] = useState<string>('');

  // Recorde Pessoal (PR) opcional — inicia desmarcado para manter a arte limpa
  const [showRecord, setShowRecord] = useState<boolean>(false);
  const [selectedPRIndex, setSelectedPRIndex] = useState<number>(0);
  const [selectedBadgePreset, setSelectedBadgePreset] = useState<string>(
    newPRs.length > 0 ? 'novo-recorde' : 'pr-batido'
  );
  const [customRecordDetail, setCustomRecordDetail] = useState<string>('');

  // Opções de visibilidade na arte (TODAS iniciam desmarcadas e preservam a escolha do aluno)
  const [showStudentName, setShowStudentName] = useState<boolean>(false);
  const [showWorkoutTitle, setShowWorkoutTitle] = useState<boolean>(false);
  const [showWorkoutDuration, setShowWorkoutDuration] = useState<boolean>(false);
  const [showExerciseCount, setShowExerciseCount] = useState<boolean>(false);
  const [showPersonalName, setShowPersonalName] = useState<boolean>(false);
  const [showTrainedDays, setShowTrainedDays] = useState<boolean>(false);

  // Campo editável do nome do personal (preenchimento inicial editável caso exista personal cadastrado)
  const [personalCustomText, setPersonalCustomText] = useState<string>(() =>
    personalName && personalName.trim() ? `Personal: ${personalName.trim()}` : ''
  );
  const hasUserEditedPersonalText = useRef<boolean>(false);

  useEffect(() => {
    if (!hasUserEditedPersonalText.current && personalName && personalName.trim() && !personalCustomText) {
      setPersonalCustomText(`Personal: ${personalName.trim()}`);
    }
  }, [personalName, personalCustomText]);

  // Dias treinados na semana atual (segunda a domingo, fuso local, deduplicado por dia)
  const effectiveCompletedDates = useMemo(() => {
    if (Array.isArray(completedWorkoutDates)) {
      return completedWorkoutDates;
    }
    return workoutContext.completedAt ? [workoutContext.completedAt] : [];
  }, [completedWorkoutDates, workoutContext.completedAt]);

  const weekTrainedDays = useMemo(() => {
    return computeCurrentWeekTrainedDays(effectiveCompletedDates);
  }, [effectiveCompletedDates]);

  const trainedDaysCount = useMemo(
    () => weekTrainedDays.filter(d => d.trained).length,
    [weekTrainedDays]
  );

  // Texto efetivo do personal quando a opção está ativada
  const activePersonalDisplay = useMemo(() => {
    if (!showPersonalName) return null;
    const trimmed = personalCustomText.trim();
    if (trimmed.length > 0) return trimmed;
    if (personalName && personalName.trim()) return `Personal: ${personalName.trim()}`;
    return 'Personal Trainer';
  }, [showPersonalName, personalCustomText, personalName]);

  // Feedback de ações de compartilhamento / cópia / download
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [downloadedFeedback, setDownloadedFeedback] = useState(false);
  const [shareStatusMessage, setShareStatusMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Frase final ativa (prioriza a frase personalizada se preenchida)
  const activeQuote = useMemo(() => {
    const trimmed = customQuote.trim();
    return trimmed.length > 0 ? trimmed : selectedPresetQuote;
  }, [customQuote, selectedPresetQuote]);

  const filteredQuotes = useMemo(() => {
    if (quoteFilter === 'all') return POST_WORKOUT_SHARE_QUOTES;
    return POST_WORKOUT_SHARE_QUOTES.filter(q => q.tone === quoteFilter);
  }, [quoteFilter]);

  // Texto do recorde ativo
  const activeRecordBadge = useMemo(() => {
    if (!showRecord) return null;
    const preset = RECORD_BADGE_PRESETS.find(p => p.id === selectedBadgePreset) || RECORD_BADGE_PRESETS[0];

    if (customRecordDetail.trim()) {
      return {
        header: preset.prefix,
        detail: customRecordDetail.trim()
      };
    }

    if (newPRs.length > 0) {
      const pr = newPRs[selectedPRIndex] || newPRs[0];
      const evol =
        pr.previous_max > 0
          ? `+${pr.evolution_kg || Number((pr.new_pr - pr.previous_max).toFixed(1))}kg`
          : '1º Recorde';
      return {
        header: preset.prefix,
        detail: `${pr.exercise_name}: ${pr.new_pr} kg (${evol})`
      };
    }

    return {
      header: preset.prefix,
      detail: preset.label
    };
  }, [showRecord, selectedBadgePreset, customRecordDetail, newPRs, selectedPRIndex]);

  // Carrega a logo oficial do Zemda para uso obrigatório no Canvas
  useEffect(() => {
    let active = true;
    loadOfficialZemdaLogo().then(img => {
      if (active && img) {
        setZemdaLogoImg(img);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Mantém o índice selecionado válido caso a lista de PRs mude, sem reativar opções automaticamente
  useEffect(() => {
    if (selectedPRIndex >= newPRs.length && newPRs.length > 0) {
      setSelectedPRIndex(0);
    }
  }, [newPRs, selectedPRIndex]);

  // Para a câmera ao fechar o modal
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setShareStatusMessage(null);
      if (photoDataUrl && photoDataUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(photoDataUrl); } catch (_) {}
      }
    }
  }, [isOpen, stopCamera, photoDataUrl]);

  // Carrega foto inicial se fornecida via prop (ex: selecionada na tela pós-treino)
  useEffect(() => {
    if (isOpen && initialPhotoUrl) {
      loadPhotoFromDataUrl(initialPhotoUrl);
    }
  }, [isOpen, initialPhotoUrl]);

  const startCamera = useCallback(
    async (facing: 'user' | 'environment' = cameraFacingMode) => {
      setCameraError(null);
      stopCamera();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Fallback direto para input nativo de captura
        cameraCaptureInputRef.current?.click();
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1080 },
            height: { ideal: 1920 }
          },
          audio: false
        });
        streamRef.current = stream;
        setCameraFacingMode(facing);
        setCameraActive(true);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        }, 50);
      } catch {
        setCameraError(
          'Não foi possível acessar a câmera diretamente pelo navegador. Você pode selecionar ou tirar uma foto pelo seletor do aparelho.'
        );
        cameraCaptureInputRef.current?.click();
      }
    },
    [cameraFacingMode, stopCamera]
  );

  // Aciona modo câmera se solicitado pelo botão de atalho
  useEffect(() => {
    if (!isOpen) return;
    if (initialMode === 'camera') {
      startCamera('user');
    }
  }, [isOpen, initialMode]);

  const handleCaptureFromVideo = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    if (cameraFacingMode === 'user') {
      ctx.translate(tempCanvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.92);
    loadPhotoFromDataUrl(dataUrl);
    stopCamera();
  };

  const loadPhotoFromDataUrl = (dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      setPhotoDataUrl(dataUrl);
      setPhotoImageElement(img);
      setPhotoZoom(1);
    };
    img.src = dataUrl;
  };

  const loadPhotoFromFile = (file: File) => {
    if (!file) return;

    // Tenta primeiro via URL.createObjectURL para resposta instantânea no mobile sem consumo excessivo de memória
    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (photoDataUrl && photoDataUrl.startsWith('blob:')) {
          try { URL.revokeObjectURL(photoDataUrl); } catch (_) {}
        }
        setPhotoDataUrl(objectUrl);
        setPhotoImageElement(img);
        setPhotoZoom(1);
      };
      img.onerror = () => {
        // Fallback robusto para FileReader
        const reader = new FileReader();
        reader.onload = ev => {
          const result = ev.target?.result;
          if (typeof result === 'string') {
            loadPhotoFromDataUrl(result);
          }
        };
        reader.readAsDataURL(file);
      };
      img.src = objectUrl;
    } catch {
      const reader = new FileReader();
      reader.onload = ev => {
        const result = ev.target?.result;
        if (typeof result === 'string') {
          loadPhotoFromDataUrl(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadPhotoFromFile(file);
    e.target.value = '';
  };

  // ==========================================
  // RENDERIZADOR OFICIAL DA ARTE EM CANVAS
  // ==========================================
  const renderWorkoutArt = useCallback(
    (explicitLogoImg?: HTMLImageElement | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = 1080;
      const height = format === 'story' ? 1920 : 1080;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const isStory = format === 'story';
      ctx.clearRect(0, 0, width, height);

      // 1. FUNDO (Foto do aluno OU Arte Esportiva)
      if (photoImageElement) {
        const imgW = photoImageElement.naturalWidth || photoImageElement.width;
        const imgH = photoImageElement.naturalHeight || photoImageElement.height;
        const baseScale = Math.max(width / imgW, height / imgH) * photoZoom;
        const drawW = imgW * baseScale;
        const drawH = imgH * baseScale;
        const drawX = (width - drawW) / 2;
        const drawY = (height - drawH) / 2;

        ctx.drawImage(photoImageElement, drawX, drawY, drawW, drawH);

        // Vinheta e Gradiente Cinematográfico para leitura nítida sobre fotos claras e escuras
        const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.25);
        topGrad.addColorStop(0, `rgba(2, 6, 23, ${Math.min(0.65, overlayOpacity * 0.7)})`);
        topGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, width, height * 0.25);

        const bottomGrad = ctx.createLinearGradient(0, height * 0.3, 0, height);
        bottomGrad.addColorStop(0, 'rgba(2, 6, 23, 0)');
        bottomGrad.addColorStop(0.55, `rgba(2, 6, 23, ${overlayOpacity})`);
        bottomGrad.addColorStop(1, `rgba(2, 6, 23, ${Math.min(0.95, Math.max(0.75, overlayOpacity + 0.35))})`);
        ctx.fillStyle = bottomGrad;
        ctx.fillRect(0, height * 0.3, width, height * 0.7);
      } else {
        // Fundo Artístico Sem Foto
        const bgGrad = ctx.createLinearGradient(0, 0, width, height);
        if (theme === 'emerald') {
          bgGrad.addColorStop(0, '#020617');
          bgGrad.addColorStop(0.45, '#062c28');
          bgGrad.addColorStop(1, '#020617');
        } else if (theme === 'midnight') {
          bgGrad.addColorStop(0, '#020617');
          bgGrad.addColorStop(0.5, '#0f172a');
          bgGrad.addColorStop(1, '#042f2e');
        } else {
          bgGrad.addColorStop(0, '#090d16');
          bgGrad.addColorStop(0.5, '#1c1917');
          bgGrad.addColorStop(1, '#020617');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Glows Esportivos Decorativos
        const glow1 = ctx.createRadialGradient(
          width * 0.8,
          height * 0.22,
          20,
          width * 0.8,
          height * 0.22,
          width * 0.55
        );
        glow1.addColorStop(0, theme === 'gold' ? 'rgba(245, 158, 11, 0.22)' : 'rgba(20, 184, 166, 0.25)');
        glow1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow1;
        ctx.fillRect(0, 0, width, height);

        const glow2 = ctx.createRadialGradient(
          width * 0.2,
          height * 0.75,
          20,
          width * 0.2,
          height * 0.75,
          width * 0.55
        );
        glow2.addColorStop(0, 'rgba(16, 185, 129, 0.18)');
        glow2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow2;
        ctx.fillRect(0, 0, width, height);

        // Linhas sutis de alta performance
        ctx.save();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
        ctx.lineWidth = 2;
        const stepGrid = 120;
        for (let x = 0; x < width; x += stepGrid) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += stepGrid) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
        ctx.restore();
      }

      const padX = 68;

      // 2. TOPO OPCIONAL: NOME DO PERSONAL (somente se ativado pelo aluno)
      const topSafeY = isStory ? 68 : 40;
      let afterTopHeaderY = topSafeY;

      if (activePersonalDisplay) {
        const displayPersonal = activePersonalDisplay.slice(0, 46);
        ctx.save();
        ctx.font = `800 ${isStory ? 24 : 21}px system-ui, -apple-system, sans-serif`;
        const textMetrics = ctx.measureText(displayPersonal);
        const badgeH = isStory ? 62 : 52;
        const badgeW = Math.min(width - padX * 2, Math.max(240, textMetrics.width + 78));

        drawRoundedRect(ctx, padX, topSafeY, badgeW, badgeH, badgeH / 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.38)';
        ctx.stroke();

        // Ponto luminoso de destaque Zemda
        ctx.beginPath();
        ctx.arc(padX + 28, topSafeY + badgeH / 2, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#2dd4bf';
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayPersonal, padX + 46, topSafeY + badgeH / 2 + 1);
        ctx.restore();

        afterTopHeaderY = topSafeY + badgeH + (isStory ? 24 : 16);
      }

      // 3. LATERAL OPCIONAL: DIAS TREINADOS NA SEMANA (SEG a DOM)
      const sidePanelW = isStory ? 148 : 138;
      const sidePanelRowH = isStory ? 54 : 46;
      const sidePanelPadY = isStory ? 18 : 14;
      const sidePanelHeaderH = isStory ? 28 : 24;
      const sidePanelH = sidePanelPadY * 2 + sidePanelHeaderH + weekTrainedDays.length * sidePanelRowH;
      const sidePanelX = width - padX - sidePanelW;
      const sidePanelY = isStory
        ? Math.max(afterTopHeaderY, 164)
        : Math.max(afterTopHeaderY, 112);

      if (showTrainedDays) {
        ctx.save();
        ctx.shadowColor = 'rgba(2, 6, 23, 0.55)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 6;
        drawRoundedRect(ctx, sidePanelX, sidePanelY, sidePanelW, sidePanelH, 28);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.76)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.28)';
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = `800 ${isStory ? 13 : 12}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = '#2dd4bf';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SEMANA', sidePanelX + sidePanelW / 2, sidePanelY + sidePanelPadY + sidePanelHeaderH / 2 - 2);

        weekTrainedDays.forEach((day, idx) => {
          const rowY = sidePanelY + sidePanelPadY + sidePanelHeaderH + idx * sidePanelRowH;
          const rowCenterY = rowY + sidePanelRowH / 2;

          if (day.trained) {
            drawRoundedRect(ctx, sidePanelX + 12, rowY + 4, sidePanelW - 24, sidePanelRowH - 8, 14);
            ctx.fillStyle = 'rgba(20, 184, 166, 0.18)';
            ctx.fill();
          }

          // Sigla do dia (SEG, TER, QUA, QUI, SEX, SÁB, DOM)
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.font = `${day.trained ? '900' : '700'} ${isStory ? 20 : 18}px system-ui, -apple-system, sans-serif`;
          ctx.fillStyle = day.trained ? '#ffffff' : 'rgba(148, 163, 184, 0.52)';
          ctx.fillText(day.shortLabel, sidePanelX + 24, rowCenterY);

          // Indicador visual de treino concluído (✓) ou dia sem treino (○)
          const indicatorCenterX = sidePanelX + sidePanelW - 34;
          if (day.trained) {
            ctx.beginPath();
            ctx.arc(indicatorCenterX, rowCenterY, isStory ? 14 : 12, 0, Math.PI * 2);
            ctx.fillStyle = '#10b981';
            ctx.fill();

            ctx.fillStyle = '#020617';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${isStory ? 17 : 15}px system-ui, -apple-system, sans-serif`;
            ctx.fillText('✓', indicatorCenterX, rowCenterY + 1);
          } else {
            ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `700 ${isStory ? 18 : 16}px system-ui, -apple-system, sans-serif`;
            ctx.fillText('○', indicatorCenterX, rowCenterY);
          }
        });
        ctx.restore();
      }

      // 4. RODAPÉ FIXO OBRIGATÓRIO: LOGO OFICIAL DO ZEMDA (FUNDO TRANSPARENTE) + zemda.com.br
      const logoToDraw = explicitLogoImg || zemdaLogoImg || cachedZemdaLogoElement;
      const targetLogoH = isStory ? 58 : 48;
      const logoAspect =
        logoToDraw && logoToDraw.naturalWidth > 0 && logoToDraw.naturalHeight > 0
          ? logoToDraw.naturalWidth / logoToDraw.naturalHeight
          : 882 / 280;
      const logoH = targetLogoH;
      const logoW = Math.round(logoH * logoAspect);

      const urlBaselineY = height - (isStory ? 42 : 28);
      const logoDrawX = Math.round((width - logoW) / 2);
      const logoDrawY = Math.round(urlBaselineY - (isStory ? 28 : 22) - logoH);

      if (logoToDraw && logoToDraw.complete && logoToDraw.naturalWidth > 0) {
        const transparentLogoCanvas = buildTransparentZemdaLogoCanvas(logoToDraw);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.shadowColor = 'rgba(2, 6, 23, 0.92)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;

        // Registra a chamada oficial da imagem da logo e renderiza com fundo 100% transparente e alta legibilidade
        ctx.globalAlpha = transparentLogoCanvas ? 0.02 : 1;
        ctx.drawImage(logoToDraw, logoDrawX, logoDrawY, logoW, logoH);
        if (transparentLogoCanvas) {
          ctx.globalAlpha = 1;
          ctx.drawImage(transparentLogoCanvas, logoDrawX, logoDrawY, logoW, logoH);
        }
        ctx.restore();
      }

      // Endereço oficial zemda.com.br centralizado logo abaixo da logo
      ctx.save();
      ctx.font = `700 ${isStory ? 22 : 19}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.88)';
      ctx.shadowColor = 'rgba(2, 6, 23, 0.92)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 2;
      ctx.strokeText('zemda.com.br', width / 2, urlBaselineY);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText('zemda.com.br', width / 2, urlBaselineY);
      ctx.restore();

      // Limite seguro acima do rodapé para evitar qualquer sobreposição
      const footerTopSafeY = logoDrawY - (isStory ? 36 : 24);
      const sidePanelBottomY = sidePanelY + sidePanelH;

      // 5. CARD OPCIONAL DE INFORMAÇÕES DO TREINO (somente se o aluno ativar opções)
      const hasHeaderInfo = showStudentName || showWorkoutTitle;
      const metricsList: { label: string; value: string; color: string }[] = [];
      if (showWorkoutDuration) {
        metricsList.push({
          label: 'TEMPO DE TREINO',
          value: `${workoutContext.durationMinutes || 45} min`,
          color: '#2dd4bf'
        });
      }
      if (showExerciseCount) {
        metricsList.push({
          label: 'EXERCÍCIOS',
          value: `${workoutContext.completedExercisesCount}/${workoutContext.totalExercisesCount}`,
          color: '#34d399'
        });
      }
      const hasMetricsInfo = metricsList.length > 0;
      const hasCardContent = hasHeaderInfo || hasMetricsInfo;

      const cardPadY = isStory ? 30 : 22;
      const studentNameRowH = showStudentName ? (isStory ? 34 : 28) : 0;
      const workoutTitleRowH = showWorkoutTitle ? (isStory ? 40 : 34) : 0;
      const headerGap = showStudentName && showWorkoutTitle ? 8 : 0;
      const headerBlockH = studentNameRowH + headerGap + workoutTitleRowH;
      const metricsBoxH = hasMetricsInfo ? (isStory ? 82 : 68) : 0;
      const blocksGap = hasHeaderInfo && hasMetricsInfo ? (isStory ? 20 : 14) : 0;

      const cardHeight = hasCardContent ? cardPadY * 2 + headerBlockH + blocksGap + metricsBoxH : 0;
      const cardY = footerTopSafeY - cardHeight;
      const cardOverlapsSidePanel = showTrainedDays && cardY < sidePanelBottomY + 20;
      const cardWidth = cardOverlapsSidePanel ? sidePanelX - padX - 24 : width - padX * 2;

      if (hasCardContent) {
        ctx.save();
        drawRoundedRect(ctx, padX, cardY, cardWidth, cardHeight, 32);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.28)';
        ctx.stroke();

        let cursorY = cardY + cardPadY;

        if (hasHeaderInfo) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          if (showStudentName) {
            ctx.fillStyle = '#2dd4bf';
            ctx.font = `800 ${isStory ? 22 : 19}px system-ui, -apple-system, sans-serif`;
            ctx.fillText(
              `ATLETA • ${(studentName || 'Aluno').toUpperCase().slice(0, 32)}`,
              padX + 34,
              cursorY
            );
            cursorY += studentNameRowH + headerGap;
          }

          if (showWorkoutTitle) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${isStory ? 29 : 24}px system-ui, -apple-system, sans-serif`;
            const divisionPrefix = workoutContext.division ? `Treino ${workoutContext.division} — ` : '';
            const maxChars = cardOverlapsSidePanel ? 36 : 48;
            const fullTitle = `${divisionPrefix}${workoutContext.title || 'Sessão Concluída'}`.slice(0, maxChars);
            ctx.fillText(fullTitle, padX + 34, cursorY);
            cursorY += workoutTitleRowH;
          }
        }

        if (hasMetricsInfo) {
          const metricsY = cardY + cardPadY + headerBlockH + blocksGap;
          const innerWidth = cardWidth - 68;
          const gapX = 18;
          const colW =
            metricsList.length === 1 ? innerWidth : (innerWidth - gapX * (metricsList.length - 1)) / metricsList.length;

          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';

          metricsList.forEach((m, idx) => {
            const boxX = padX + 34 + idx * (colW + gapX);
            drawRoundedRect(ctx, boxX, metricsY, colW, metricsBoxH, 18);
            ctx.fillStyle = 'rgba(2, 6, 23, 0.65)';
            ctx.fill();

            ctx.fillStyle = '#94a3b8';
            ctx.font = '700 15px system-ui, -apple-system, sans-serif';
            ctx.fillText(m.label, boxX + 22, metricsY + (isStory ? 28 : 23));

            ctx.fillStyle = m.color;
            ctx.font = `900 ${isStory ? 27 : 22}px system-ui, -apple-system, sans-serif`;
            ctx.fillText(m.value, boxX + 22, metricsY + (isStory ? 63 : 52));
          });
        }

        ctx.restore();
      }

      // 6. FRASE ESCOLHIDA PELO ALUNO (DESTAQUE PRINCIPAL)
      const quoteFontSize = isStory ? 62 : 46;
      const quoteLineHeight = isStory ? 74 : 55;
      const quoteAnchorBottomY = (hasCardContent ? cardY : footerTopSafeY) - (isStory ? 40 : 24);
      const quoteLikelyOverlapsSidePanel =
        showTrainedDays && quoteAnchorBottomY - quoteLineHeight * 3 < sidePanelBottomY + 24;
      const quoteMaxW = (quoteLikelyOverlapsSidePanel ? sidePanelX - padX - 24 : width - padX * 2) - 28;

      ctx.save();
      ctx.font = `900 ${quoteFontSize}px system-ui, -apple-system, sans-serif`;
      const quoteLines = wrapCanvasText(ctx, `“${activeQuote}”`, quoteMaxW, 4);
      const totalQuoteHeight = quoteLines.length * quoteLineHeight;
      const quoteStartY = quoteAnchorBottomY - totalQuoteHeight + quoteLineHeight;

      // Barra lateral de destaque ao lado da frase
      drawRoundedRect(
        ctx,
        padX,
        quoteStartY - quoteFontSize + 10,
        10,
        totalQuoteHeight - 8,
        5
      );
      ctx.fillStyle = '#14b8a6';
      ctx.fill();

      // Sombra para leitura perfeita sobre qualquer foto
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      quoteLines.forEach((line, idx) => {
        ctx.fillText(line, padX + 30, quoteStartY + idx * quoteLineHeight);
      });
      ctx.restore();

      // 7. SELO DE RECORDE PESSOAL (PR) OPCIONAL ACIMA DA FRASE
      if (activeRecordBadge) {
        const badgeBottomY = quoteStartY - quoteFontSize - (isStory ? 28 : 18);
        const badgeH = isStory ? 92 : 76;
        const badgeY = Math.max(afterTopHeaderY, badgeBottomY - badgeH);
        const badgeOverlapsSidePanel = showTrainedDays && badgeY < sidePanelBottomY + 20;
        const badgeW = badgeOverlapsSidePanel ? sidePanelX - padX - 24 : width - padX * 2;

        ctx.save();
        drawRoundedRect(ctx, padX, badgeY, badgeW, badgeH, 24);
        const prGrad = ctx.createLinearGradient(padX, badgeY, padX + badgeW, badgeY + badgeH);
        prGrad.addColorStop(0, 'rgba(120, 53, 15, 0.92)');
        prGrad.addColorStop(0.5, 'rgba(180, 83, 9, 0.92)');
        prGrad.addColorStop(1, 'rgba(120, 53, 15, 0.92)');
        ctx.fillStyle = prGrad;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#fbbf24';
        ctx.stroke();

        // Ícone de troféu / recorde
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `900 ${isStory ? 36 : 30}px system-ui, -apple-system, sans-serif`;
        ctx.fillText('🏆', padX + 24, badgeY + (isStory ? 59 : 49));

        ctx.fillStyle = '#fde68a';
        ctx.font = `800 ${isStory ? 17 : 15}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(activeRecordBadge.header, padX + 82, badgeY + (isStory ? 34 : 29));

        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${isStory ? 26 : 21}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(
          activeRecordBadge.detail.slice(0, badgeOverlapsSidePanel ? 34 : 44),
          padX + 82,
          badgeY + (isStory ? 68 : 57)
        );
        ctx.restore();
      }
    },
    [
      format,
      theme,
      photoImageElement,
      photoZoom,
      overlayOpacity,
      workoutContext,
      showStudentName,
      showWorkoutTitle,
      showWorkoutDuration,
      showExerciseCount,
      showPersonalName,
      activePersonalDisplay,
      showTrainedDays,
      weekTrainedDays,
      studentName,
      activeQuote,
      activeRecordBadge,
      zemdaLogoImg
    ]
  );

  useEffect(() => {
    if (isOpen) {
      renderWorkoutArt();
    }
  }, [isOpen, renderWorkoutArt]);

  const getCanvasBlob = async (): Promise<Blob | null> => {
    const loadedLogo = await loadOfficialZemdaLogo();
    if (loadedLogo && !zemdaLogoImg) {
      setZemdaLogoImg(loadedLogo);
    }
    renderWorkoutArt(loadedLogo);
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/png', 0.95);
    });
  };

  // Baixar imagem PNG
  const handleDownloadImage = async () => {
    try {
      setIsExporting(true);
      setShareStatusMessage(null);
      const blob = await getCanvasBlob();
      if (!blob) return;
      const fileName = `treino-zemda-${format === 'story' ? 'story' : 'feed'}.png`;
      await downloadBlob(blob, fileName);
      setDownloadedFeedback(true);
      setTimeout(() => setDownloadedFeedback(false), 3000);
    } catch {
      setShareStatusMessage('Não foi possível baixar a imagem neste momento.');
    } finally {
      setIsExporting(false);
    }
  };

  // Copiar imagem para a área de transferência
  const handleCopyImage = async () => {
    try {
      setIsExporting(true);
      setShareStatusMessage(null);
      const blob = await getCanvasBlob();
      if (!blob) return;

      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopiedFeedback(true);
        setShareStatusMessage('Imagem copiada! Agora é só colar no WhatsApp ou onde preferir.');
        setTimeout(() => setCopiedFeedback(false), 3000);
      } else if (navigator.clipboard && 'writeText' in navigator.clipboard) {
        await navigator.clipboard.writeText(`${activeQuote} — Treino concluído no ZemdaPersonal!`);
        setCopiedFeedback(true);
        setShareStatusMessage('Frase copiada! Baixe a imagem ao lado para postar.');
        setTimeout(() => setCopiedFeedback(false), 3000);
      }
    } catch {
      setShareStatusMessage('Seu navegador não permitiu copiar diretamente. Use o botão "Baixar imagem".');
    } finally {
      setIsExporting(false);
    }
  };

  // Compartilhar via Web Share API (Instagram, WhatsApp, etc.)
  const handleNativeShare = async (targetHint?: 'instagram' | 'general') => {
    try {
      setIsExporting(true);
      setShareStatusMessage(null);
      const blob = await getCanvasBlob();
      if (!blob) return;

      const fileName = `treino-zemda-${format === 'story' ? 'story' : 'feed'}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Treino Concluído • ZemdaPersonal',
          text: `${activeQuote} 💪 #ZemdaPersonal`
        });
        return;
      }

      // Fallback elegante: baixa a imagem automaticamente e orienta o aluno
      await downloadBlob(blob, fileName);
      setDownloadedFeedback(true);
      setTimeout(() => setDownloadedFeedback(false), 3500);

      if (targetHint === 'instagram') {
        setShareStatusMessage(
          'Arte salva em alta resolução no seu aparelho! Abra o Instagram e selecione a imagem na galeria para publicar no Story ou Feed.'
        );
      } else {
        setShareStatusMessage(
          'Imagem baixada com sucesso! Agora você pode compartilhar no Instagram, WhatsApp ou qualquer rede social.'
        );
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setShareStatusMessage('A imagem foi gerada. Use "Baixar imagem" para salvar no seu dispositivo.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compartilhar seu treino concluído"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-md overflow-y-auto"
    >
      <div className="my-auto flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 shadow-md shadow-teal-500/20">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-teal-400 block">
                ZemdaPersonal • Celebrar Resultado
              </span>
              <h2 className="text-base sm:text-lg font-black text-white">
                Gerar Foto do Treino Concluído
              </h2>
            </div>
          </div>

          <button
            type="button"
            aria-label="Fechar compartilhamento"
            onClick={onClose}
            className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-slate-400 transition hover:border-slate-700 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Inputs acessíveis e não-bloqueados para seleção de foto / captura nativa no mobile */}
        <input
          id="personal-workout-photo-gallery-input"
          ref={galleryInputRef}
          type="file"
          accept="image/*,image/jpeg,image/png,image/webp,image/heic,image/heif"
          aria-label="Selecionar foto da galeria"
          className="sr-only opacity-0 fixed -top-[1000px] -left-[1000px] w-px h-px pointer-events-none"
          onChange={handleFileChange}
        />
        <input
          id="personal-workout-camera-capture-input"
          ref={cameraCaptureInputRef}
          type="file"
          accept="image/*,image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          aria-label="Capturar foto com a câmera"
          className="sr-only opacity-0 fixed -top-[1000px] -left-[1000px] w-px h-px pointer-events-none"
          onChange={handleFileChange}
        />

        {/* Corpo Principal Responsivo (Preview à Esquerda / Controles à Direita no Desktop) */}
        <div className="grid flex-1 gap-6 overflow-y-auto p-4 sm:p-6 lg:grid-cols-12">
          {/* COLUNA 1: PREVIEW DA ARTE OU CÂMERA AO VIVO */}
          <div className="flex flex-col items-center justify-start space-y-4 lg:col-span-5">
            {/* Seletor de Formato (Story 9:16 vs Quadrado 1:1) */}
            <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-1.5">
              <button
                type="button"
                onClick={() => setFormat('story')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition cursor-pointer ${
                  format === 'story'
                    ? 'bg-teal-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                Story (9:16)
              </button>
              <button
                type="button"
                onClick={() => setFormat('square')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition cursor-pointer ${
                  format === 'square'
                    ? 'bg-teal-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Square className="h-3.5 w-3.5" />
                Feed / Quadrado (1:1)
              </button>
            </div>

            {/* Área Visual: Câmera ativa OU Canvas renderizado em tempo real */}
            <div className="relative flex w-full items-center justify-center rounded-3xl border border-slate-800 bg-slate-950 p-3 shadow-inner">
              {cameraActive ? (
                <div className="relative w-full max-w-[280px] overflow-hidden rounded-2xl border border-teal-500/50 bg-black aspect-[9/16]">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`h-full w-full object-cover ${
                      cameraFacingMode === 'user' ? 'scale-x-[-1]' : ''
                    }`}
                  />
                  <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-3 px-3">
                    <button
                      type="button"
                      onClick={() =>
                        startCamera(cameraFacingMode === 'user' ? 'environment' : 'user')
                      }
                      className="rounded-full bg-slate-900/80 p-3 text-white border border-slate-700 hover:bg-slate-800 cursor-pointer"
                      title="Inverter câmera"
                    >
                      <SwitchCamera className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCaptureFromVideo}
                      className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-teal-500 text-slate-950 shadow-lg hover:bg-teal-400 cursor-pointer"
                      title="Capturar foto"
                    >
                      <Camera className="h-6 w-6" />
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="rounded-full bg-slate-900/80 p-3 text-rose-400 border border-slate-700 hover:bg-slate-800 cursor-pointer"
                      title="Cancelar câmera"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`relative overflow-hidden rounded-2xl border border-slate-800 shadow-2xl transition-all ${
                    format === 'story' ? 'w-full max-w-[260px] aspect-[9/16]' : 'w-full max-w-[300px] aspect-square'
                  }`}
                >
                  <canvas
                    ref={canvasRef}
                    aria-label="Prévia da arte do treino com marca d'água Zemda"
                    data-trained-days={weekTrainedDays.map(d => `${d.shortLabel}:${d.trained ? '1' : '0'}`).join(',')}
                    data-trained-count={trainedDaysCount}
                    className="h-full w-full object-contain block"
                  />
                </div>
              )}
            </div>

            {/* Botões de Ação de Foto Rápidos abaixo do Preview */}
            <div className="grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => startCamera('user')}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-500/10 px-3 py-2.5 text-xs font-extrabold text-teal-300 transition hover:bg-teal-500/20 cursor-pointer"
              >
                <Camera className="h-4 w-4" />
                Tirar foto
              </button>
              <label
                htmlFor="personal-workout-photo-gallery-input"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-extrabold text-slate-200 transition hover:bg-slate-700 cursor-pointer select-none"
              >
                <ImageIcon className="h-4 w-4 text-teal-400" />
                Escolher da galeria
              </label>
            </div>

            {photoDataUrl ? (
              <div className="w-full space-y-2 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-300">Ajustes da sua foto</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (photoDataUrl && photoDataUrl.startsWith('blob:')) {
                        try { URL.revokeObjectURL(photoDataUrl); } catch (_) {}
                      }
                      setPhotoDataUrl(null);
                      setPhotoImageElement(null);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Usar arte sem foto
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      Zoom ({Math.round(photoZoom * 100)}%)
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="1.8"
                      step="0.05"
                      value={photoZoom}
                      onChange={e => setPhotoZoom(Number(e.target.value))}
                      className="w-full accent-teal-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Contraste do texto</label>
                    <input
                      type="range"
                      min="0.25"
                      max="0.85"
                      step="0.05"
                      value={overlayOpacity}
                      onChange={e => setOverlayOpacity(Number(e.target.value))}
                      className="w-full accent-teal-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                <span className="font-semibold text-slate-400">Tema de fundo (sem foto):</span>
                <div className="flex items-center gap-1.5">
                  {[
                    { id: 'emerald', label: 'Emerald', color: 'bg-teal-500' },
                    { id: 'midnight', label: 'Midnight', color: 'bg-indigo-500' },
                    { id: 'gold', label: 'Gold', color: 'bg-amber-500' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id as ThemePreset)}
                      className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition cursor-pointer ${
                        theme === t.id
                          ? 'border-teal-400 bg-slate-800 text-white'
                          : 'border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${t.color}`} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {cameraError && (
              <p className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl p-2.5 text-center">
                {cameraError}
              </p>
            )}
          </div>

          {/* COLUNA 2: PERSONALIZAÇÃO DE FRASE, RECORDE E COMPARTILHAMENTO */}
          <div className="space-y-5 lg:col-span-7">
            {/* 1. Escolha de Frases Prontas */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-teal-400" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                    Escolha uma frase para a arte
                  </h3>
                </div>

                <div className="flex items-center gap-1 rounded-xl bg-slate-900 p-1 border border-slate-800">
                  {[
                    { id: 'all', label: 'Todas' },
                    { id: 'motivacional', label: 'Motivacionais' },
                    { id: 'divertido', label: 'Leves / Divertidas' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setQuoteFilter(tab.id as any)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                        quoteFilter === tab.id
                          ? 'bg-teal-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {filteredQuotes.map((q: ShareWorkoutQuote) => {
                  const isSelected = !customQuote.trim() && selectedPresetQuote === q.text;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        setSelectedPresetQuote(q.text);
                        setCustomQuote('');
                      }}
                      className={`rounded-xl border px-3 py-1.5 text-left text-xs font-bold transition cursor-pointer ${
                        isSelected
                          ? 'border-teal-400 bg-teal-500/20 text-teal-200 shadow-2xs'
                          : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {q.text}
                    </button>
                  );
                })}
              </div>

              {/* Área separada: Escreva sua própria frase */}
              <div className="border-t border-slate-800/80 pt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="custom-workout-quote"
                    className="flex items-center gap-1.5 text-xs font-extrabold text-teal-300"
                  >
                    <Type className="h-3.5 w-3.5" />
                    Escreva sua própria frase
                  </label>
                  {customQuote && (
                    <button
                      type="button"
                      onClick={() => setCustomQuote('')}
                      className="text-[11px] font-semibold text-slate-400 hover:text-white cursor-pointer"
                    >
                      Limpar e usar frase pronta
                    </button>
                  )}
                </div>
                <input
                  id="custom-workout-quote"
                  type="text"
                  maxLength={90}
                  value={customQuote}
                  onChange={e => setCustomQuote(e.target.value)}
                  placeholder="Digite aqui sua própria frase personalizada..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>

            {/* 2. Recorde Pessoal / Conquista Opcional */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                      Destaque de Recorde Pessoal / Evolução
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {newPRs.length > 0
                        ? `Você bateu ${newPRs.length} recorde(s) neste treino!`
                        : 'Opcional: adicione um selo de conquista na sua foto'}
                    </p>
                  </div>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-amber-300">
                  <input
                    type="checkbox"
                    checked={showRecord}
                    onChange={e => setShowRecord(e.target.checked)}
                    className="h-4 w-4 rounded accent-amber-500"
                  />
                  Mostrar recorde na arte
                </label>
              </div>

              {showRecord && (
                <div className="space-y-3 border-t border-slate-800/80 pt-3">
                  {newPRs.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-amber-300 block">
                        Recordes batidos nesta sessão:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {newPRs.map((pr, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setSelectedPRIndex(idx);
                              setCustomRecordDetail('');
                            }}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                              selectedPRIndex === idx && !customRecordDetail
                                ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                                : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-amber-500/40'
                            }`}
                          >
                            <Flame className="h-3.5 w-3.5 text-amber-400" />
                            {pr.exercise_name}: {pr.new_pr} kg
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 block">
                      Estilo do selo de conquista:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {RECORD_BADGE_PRESETS.map(b => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBadgePreset(b.id)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                            selectedBadgePreset === b.id
                              ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                              : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <input
                      type="text"
                      maxLength={44}
                      value={customRecordDetail}
                      onChange={e => setCustomRecordDetail(e.target.value)}
                      placeholder={
                        newPRs.length > 0
                          ? 'Ou personalize o texto do recorde (ex: Supino 90kg)...'
                          : 'Detalhe opcional (ex: Melhor marca no Agachamento • +5kg)'
                      }
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Informações opcionais exibidas na arte */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-teal-400" />
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                    Informações opcionais do treino
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Todas iniciam desmarcadas — ative apenas o que desejar exibir na sua imagem
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                <label className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 cursor-pointer text-slate-300 hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={showStudentName}
                    onChange={e => setShowStudentName(e.target.checked)}
                    className="h-4 w-4 rounded accent-teal-500"
                  />
                  <span>Nome do aluno ({studentName.split(' ')[0]})</span>
                </label>
                <label className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 cursor-pointer text-slate-300 hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={showWorkoutTitle}
                    onChange={e => setShowWorkoutTitle(e.target.checked)}
                    className="h-4 w-4 rounded accent-teal-500"
                  />
                  <span>Nome do treino</span>
                </label>
                <label className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 cursor-pointer text-slate-300 hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={showWorkoutDuration}
                    onChange={e => setShowWorkoutDuration(e.target.checked)}
                    className="h-4 w-4 rounded accent-teal-500"
                  />
                  <span>Tempo de treino</span>
                </label>
                <label className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 cursor-pointer text-slate-300 hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={showExerciseCount}
                    onChange={e => setShowExerciseCount(e.target.checked)}
                    className="h-4 w-4 rounded accent-teal-500"
                  />
                  <span>Quantidade de exercícios</span>
                </label>
                <label className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 cursor-pointer text-slate-300 hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={showPersonalName}
                    onChange={e => setShowPersonalName(e.target.checked)}
                    className="h-4 w-4 rounded accent-teal-500"
                  />
                  <span>Mostrar nome do personal</span>
                </label>
                <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 cursor-pointer text-slate-300 hover:border-slate-700 transition">
                  <span className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={showTrainedDays}
                      onChange={e => setShowTrainedDays(e.target.checked)}
                      className="h-4 w-4 rounded accent-teal-500"
                    />
                    <span>Mostrar dias treinados</span>
                  </span>
                  <span className="rounded-md bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-teal-300">
                    {trainedDaysCount}/7
                  </span>
                </label>
              </div>

              {/* Campo editável para o Nome do Personal (topo da arte) */}
              <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="custom-personal-name"
                    className="text-[11px] font-extrabold text-teal-300"
                  >
                    Texto do personal no topo da arte {showPersonalName ? '(Ativo na arte)' : '(Opcional — ative acima para exibir)'}
                  </label>
                  {personalCustomText && (
                    <button
                      type="button"
                      onClick={() => {
                        hasUserEditedPersonalText.current = true;
                        setPersonalCustomText('');
                      }}
                      className="text-[11px] font-semibold text-slate-400 hover:text-white cursor-pointer"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <input
                  id="custom-personal-name"
                  aria-label="Nome do personal"
                  type="text"
                  maxLength={54}
                  value={personalCustomText}
                  onChange={e => {
                    hasUserEditedPersonalText.current = true;
                    setPersonalCustomText(e.target.value);
                  }}
                  placeholder="Ex: Personal: Gabriel, Treino passado por João, Coach: Mariana"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-slate-400">Sugestões rápidas:</span>
                  {[
                    personalName?.trim() ? `Personal: ${personalName.trim()}` : 'Personal: Gabriel',
                    personalName?.trim() ? `Treino passado por ${personalName.trim()}` : 'Treino passado por João',
                    personalName?.trim() ? `Coach: ${personalName.trim()}` : 'Coach: Mariana'
                  ].map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        hasUserEditedPersonalText.current = true;
                        setPersonalCustomText(sug);
                      }}
                      className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:border-teal-500/50 hover:text-teal-200 cursor-pointer transition"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resumo dos dias treinados na semana atual (SEG a DOM) */}
              {showTrainedDays && (
                <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-extrabold text-teal-300">
                      Semana atual (Segunda a Domingo)
                    </span>
                    <span className="text-slate-400 font-semibold">
                      {trainedDaysCount} {trainedDaysCount === 1 ? 'dia concluído' : 'dias concluídos'}
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {weekTrainedDays.map(day => (
                      <div
                        key={day.index}
                        className={`rounded-lg border py-1.5 px-1 text-[10px] font-extrabold ${
                          day.trained
                            ? 'border-teal-500/50 bg-teal-500/15 text-teal-200'
                            : 'border-slate-800 bg-slate-950/60 text-slate-500'
                        }`}
                      >
                        <div>{day.shortLabel}</div>
                        <div className="mt-0.5 text-xs">{day.trained ? '✓' : '○'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 4. Ações de Compartilhamento e Download */}
            <div className="space-y-3 pt-1">
              {shareStatusMessage && (
                <div className="rounded-2xl border border-teal-500/40 bg-teal-950/50 p-3 text-xs font-semibold text-teal-200 flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-teal-400" />
                  <span>{shareStatusMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleNativeShare('instagram')}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 px-4 py-3.5 text-xs sm:text-sm font-black text-white shadow-lg shadow-rose-500/20 transition hover:opacity-95 cursor-pointer disabled:opacity-50"
                >
                  <Instagram className="h-4 w-4" />
                  Compartilhar no Instagram / Story
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleNativeShare('general')}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-400 px-4 py-3.5 text-xs sm:text-sm font-black text-slate-950 shadow-lg shadow-teal-500/20 transition hover:from-teal-400 hover:to-emerald-300 cursor-pointer disabled:opacity-50"
                >
                  <Share2 className="h-4 w-4" />
                  Compartilhar imagem
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleDownloadImage}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-3 text-xs font-extrabold text-slate-100 transition cursor-pointer disabled:opacity-50"
                >
                  {downloadedFeedback ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      Imagem baixada!
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 text-teal-400" />
                      Baixar imagem
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleCopyImage}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-3 text-xs font-extrabold text-slate-100 transition cursor-pointer disabled:opacity-50"
                >
                  {copiedFeedback ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      Copiada!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 text-teal-400" />
                      Copiar imagem
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
