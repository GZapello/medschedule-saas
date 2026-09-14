import React, { useRef, useState, useEffect } from 'react';
import {
  PenTool,
  Circle,
  RotateCcw,
  Trash2,
  Eye,
  CheckCircle2,
  Sparkles,
  Maximize2
} from 'lucide-react';

export interface DrawAction {
  type: 'path' | 'circle';
  points?: { x: number; y: number }[];
  circle?: { x: number; y: number; r: number };
  color: string;
  size: number;
}

interface BodyPainMapCanvasProps {
  initialDataJson?: string;
  initialImageDataUrl?: string;
  readOnly?: boolean;
  onSave?: (dataJson: string, imageDataUrl: string) => void;
  height?: number;
}

export const BodyPainMapCanvas: React.FC<BodyPainMapCanvasProps> = ({
  initialDataJson,
  initialImageDataUrl,
  readOnly = false,
  onSave,
  height = 560
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Ferramentas
  const [tool, setTool] = useState<'freehand' | 'point'>('freehand');
  const [brushSize, setBrushSize] = useState<number>(5);
  const [history, setHistory] = useState<DrawAction[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);

  // Imagem base anatômica enviada pelo usuário
  const baseImageRef = useRef<HTMLImageElement | null>(null);

  // Inicializa imagem
  useEffect(() => {
    const img = new Image();
    img.src = '/body-map-anatomy.jpg';
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      baseImageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.warn('Não foi possível carregar a imagem anatômica /body-map-anatomy.jpg');
      setImageLoaded(true); // renderiza mesmo sem a imagem base
    };
  }, []);

  // Carrega histórico inicial se houver
  useEffect(() => {
    if (initialDataJson) {
      try {
        const parsed = JSON.parse(initialDataJson);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      } catch (e) {
        console.error('Erro ao ler dados anteriores do mapa corporal:', e);
      }
    }
  }, [initialDataJson]);

  // Redesenha canvas sempre que o histórico ou estado de desenho mudar
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ajusta resolução do canvas com base no container
    const width = canvas.parentElement?.clientWidth || 800;
    canvas.width = width;
    canvas.height = height;

    // Limpa tela
    ctx.clearRect(0, 0, width, height);

    // Desenha fundo branco limpo
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Desenha a imagem base anatômica preservando aspect ratio
    if (baseImageRef.current) {
      const img = baseImageRef.current;
      const hRatio = width / img.width;
      const vRatio = height / img.height;
      const ratio = Math.min(hRatio, vRatio);
      const centerShiftX = (width - img.width * ratio) / 2;
      const centerShiftY = (height - img.height * ratio) / 2;
      ctx.drawImage(
        img,
        0, 0, img.width, img.height,
        centerShiftX, centerShiftY, img.width * ratio, img.height * ratio
      );
    }

    // Função de desenho de caneta amarela médica com halo sutil para contraste
    const drawItem = (action: DrawAction) => {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (action.type === 'path' && action.points && action.points.length > 0) {
        // Halo de destaque para contraste sobre a musculatura
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)'; // Amarelo translúcido expandido
        ctx.lineWidth = action.size + 4;
        ctx.beginPath();
        action.points.forEach((pt, i) => {
          const absX = pt.x * width;
          const absY = pt.y * height;
          if (i === 0) ctx.moveTo(absX, absY);
          else ctx.lineTo(absX, absY);
        });
        ctx.stroke();

        // Traço principal (Amarelo vibrante #facc15)
        ctx.strokeStyle = action.color || '#facc15';
        ctx.lineWidth = action.size;
        ctx.beginPath();
        action.points.forEach((pt, i) => {
          const absX = pt.x * width;
          const absY = pt.y * height;
          if (i === 0) ctx.moveTo(absX, absY);
          else ctx.lineTo(absX, absY);
        });
        ctx.stroke();
      } else if (action.type === 'circle' && action.circle) {
        const absX = action.circle.x * width;
        const absY = action.circle.y * height;
        const absR = action.circle.r;

        // Círculo com preenchimento translúcido e borda amarela viva
        ctx.fillStyle = 'rgba(250, 204, 21, 0.45)';
        ctx.beginPath();
        ctx.arc(absX, absY, absR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#eab308'; // Borda amarela mais escura para definição
        ctx.lineWidth = action.size || 3;
        ctx.beginPath();
        ctx.arc(absX, absY, absR, 0, Math.PI * 2);
        ctx.stroke();

        // Ponto central
        ctx.fillStyle = '#ca8a04';
        ctx.beginPath();
        ctx.arc(absX, absY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    // Desenha histórico
    history.forEach(drawItem);

    // Desenha traço corrente em andamento
    if (currentPath.length > 0) {
      drawItem({
        type: 'path',
        points: currentPath,
        color: '#facc15',
        size: brushSize
      });
    }
  }, [history, currentPath, imageLoaded, height, brushSize]);

  // Converte coordenadas do mouse/touch para porcentagem relativa (0..1)
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x: relX, y: relY };
  };

  const handleStartDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const coords = getCoordinates(e);

    if (tool === 'point') {
      // Ponto / Círculo de Dor
      const newAction: DrawAction = {
        type: 'circle',
        circle: { x: coords.x, y: coords.y, r: brushSize * 2.8 },
        color: '#facc15',
        size: Math.max(2, Math.floor(brushSize / 2))
      };
      const newHistory = [...history, newAction];
      setHistory(newHistory);
      notifySave(newHistory);
      return;
    }

    setIsDrawing(true);
    setCurrentPath([coords]);
  };

  const handleMoveDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (readOnly || !isDrawing || tool !== 'freehand') return;
    const coords = getCoordinates(e);
    setCurrentPath(prev => [...prev, coords]);
  };

  const handleEndDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath.length > 1) {
      const newAction: DrawAction = {
        type: 'path',
        points: currentPath,
        color: '#facc15',
        size: brushSize
      };
      const newHistory = [...history, newAction];
      setHistory(newHistory);
      notifySave(newHistory);
    }
    setCurrentPath([]);
  };

  const notifySave = (items: DrawAction[]) => {
    if (onSave) {
      const canvas = canvasRef.current;
      const dataUrl = canvas ? canvas.toDataURL('image/jpeg', 0.85) : '';
      onSave(JSON.stringify(items), dataUrl);
    }
  };

  const handleUndo = () => {
    if (history.length === 0 || readOnly) return;
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    notifySave(newHistory);
  };

  const handleClear = () => {
    if (readOnly) return;
    setHistory([]);
    notifySave([]);
  };

  return (
    <div ref={containerRef} className="space-y-2.5">
      {/* Barra de Ferramentas da Caneta Amarela */}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-900 text-white rounded-2xl shadow-xs text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Caneta Amarela (Mapa de Dor)
            </span>

            <div className="h-4 w-px bg-slate-700 mx-1" />

            <button
              type="button"
              onClick={() => setTool('freehand')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                tool === 'freehand'
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Desenho Livre (Riscos, Áreas e Contornos de dor)"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Desenho Livre</span>
            </button>

            <button
              type="button"
              onClick={() => setTool('point')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                tool === 'point'
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Ponto / Círculo Focal de Dor"
            >
              <Circle className="w-3.5 h-3.5" />
              <span>Ponto / Círculo</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Seletor de Espessura */}
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px]">
              <span>Traço:</span>
              {[3, 6, 10].map(sz => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setBrushSize(sz)}
                  className={`w-6 h-6 rounded-lg font-bold flex items-center justify-center transition-all cursor-pointer ${
                    brushSize === sz
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {sz === 3 ? 'P' : sz === 6 ? 'M' : 'G'}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-slate-700" />

            {/* Desfazer */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={history.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
              title="Desfazer última marcação"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Desfazer</span>
            </button>

            {/* Limpar Tudo */}
            <button
              type="button"
              onClick={handleClear}
              disabled={history.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-rose-300 hover:text-rose-100 hover:bg-rose-950/60 transition-colors disabled:opacity-40 cursor-pointer"
              title="Limpar todas as marcações"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          </div>
        </div>
      )}

      {/* Canvas Interativo */}
      <div className="relative border-2 border-slate-200 rounded-2xl overflow-hidden bg-white shadow-inner flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onMouseDown={handleStartDraw}
          onMouseMove={handleMoveDraw}
          onMouseUp={handleEndDraw}
          onMouseLeave={handleEndDraw}
          onTouchStart={handleStartDraw}
          onTouchMove={handleMoveDraw}
          onTouchEnd={handleEndDraw}
          className={`w-full touch-none block ${readOnly ? 'cursor-default' : 'cursor-crosshair'}`}
          style={{ height: `${height}px` }}
        />

        {/* Legenda anatômica e status */}
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] text-slate-500 bg-white/90 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-slate-200/80 pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-500 inline-block shadow-xs" />
            <span className="font-semibold text-slate-700">Caneta Amarela: Pontos & Áreas Dolorosas</span>
          </div>
          <div className="font-medium text-slate-400">
            {history.length} {history.length === 1 ? 'marcação registrada' : 'marcações registradas'}
          </div>
        </div>
      </div>
    </div>
  );
};
