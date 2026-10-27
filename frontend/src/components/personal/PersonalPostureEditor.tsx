import React, { useEffect, useRef, useState } from 'react';
import {
  Hand,
  Pencil,
  Minus,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Grid,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { PosturePhotoCanvas } from './PosturePhotoCanvas';
import {
  Posture,
  PosturePhoto,
  View,
  Region,
  Stroke,
  StrokeSize,
  Observation,
  views,
  regions,
  evolutionLabels,
  strokeColors,
  strokeSizes
} from './posture';

interface Props {
  value: Posture;
  onChange: (value: Posture) => void;
  photos: PosturePhoto[];
  patientId: string;
  onBusy?: (busy: boolean) => void;
  renderViewUploader?: (view: View) => React.ReactNode;
}

export default function PersonalPostureEditor({
  value,
  onChange,
  photos,
  patientId,
  onBusy,
  renderViewUploader
}: Props) {
  const [view, setView] = useState<View>('front');
  const [tool, setTool] = useState<'select' | 'pen' | 'line' | 'eraser'>('select');
  const [strokeColor, setStrokeColor] = useState<string>('#f43f5e');
  const [strokeSize, setStrokeSize] = useState<StrokeSize>('medium');
  const [region, setRegion] = useState<Region>('head');
  const [showAllViewNotes, setShowAllViewNotes] = useState<boolean>(false);

  // Histórico Desfazer / Refazer por vista
  const [undoByView, setUndoByView] = useState<Partial<Record<View, Stroke[][]>>>({});
  const [redoByView, setRedoByView] = useState<Partial<Record<View, Stroke[][]>>>({});

  // Controles de Zoom e Pan
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [ai, setAi] = useState<{ available: boolean; reason?: string }>({ available: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);

  const photo = photos.find(p => p.view === view) || { view, fileId: '', url: '' };
  const current = value.views[view];
  const mismatch = Boolean(current && current.fileId !== photo.fileId);
  const strokes = mismatch ? [] : current?.strokes || [];
  const undoStack = undoByView[view] || [];
  const redoStack = redoByView[view] || [];

  useEffect(() => {
    let active = true;
    ApiClient.get<any>('/v1/personal/posture-ai/status')
      .then(r => {
        if (active) setAi(r);
      })
      .catch(() => {
        if (active) setAi({ available: false, reason: 'IA indisponível neste ambiente.' });
      });
    return () => {
      active = false;
      generation.current++;
      onBusy?.(false);
    };
  }, []);

  // Resetar zoom/pan ao alternar de vista
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [view, photo.fileId]);

  const updateStrokes = (next: Stroke[]) => {
    setUndoByView(prev => ({
      ...prev,
      [view]: [...(prev[view] || []).slice(-29), strokes]
    }));
    setRedoByView(prev => ({
      ...prev,
      [view]: []
    }));
    onChange({
      ...value,
      views: {
        ...value.views,
        [view]: {
          fileId: photo.fileId,
          guides: current?.guides || false,
          strokes: next
        }
      }
    });
  };

  const handleUndo = () => {
    if (!undoStack.length || busy) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoByView(prev => ({
      ...prev,
      [view]: undoStack.slice(0, -1)
    }));
    setRedoByView(prev => ({
      ...prev,
      [view]: [...(prev[view] || []).slice(-29), strokes]
    }));
    onChange({
      ...value,
      views: {
        ...value.views,
        [view]: {
          fileId: photo.fileId,
          guides: current?.guides || false,
          strokes: previous
        }
      }
    });
  };

  const handleRedo = () => {
    if (!redoStack.length || busy) return;
    const next = redoStack[redoStack.length - 1];
    setRedoByView(prev => ({
      ...prev,
      [view]: redoStack.slice(0, -1)
    }));
    setUndoByView(prev => ({
      ...prev,
      [view]: [...(prev[view] || []).slice(-29), strokes]
    }));
    onChange({
      ...value,
      views: {
        ...value.views,
        [view]: {
          fileId: photo.fileId,
          guides: current?.guides || false,
          strokes: next
        }
      }
    });
  };

  const handleClearStrokes = () => {
    if (!strokes.length || busy) return;
    updateStrokes([]);
  };

  const handleZoomOut = () => {
    setZoom(prev => {
      const next = Math.max(1, Math.round((prev - 0.25) * 100) / 100);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(3, Math.round((prev + 0.25) * 100) / 100));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const add = (r: Region) => {
    if (value.observations.length >= 180) return;
    setRegion(r);
    onChange({
      ...value,
      observations: [
        ...value.observations,
        {
          id: crypto.randomUUID(),
          region: r,
          view,
          text: '',
          evolution: 'unrated',
          source: 'manual',
          reviewed: true
        }
      ]
    });
  };

  const edit = (id: string, patch: Partial<Observation>) =>
    onChange({
      ...value,
      observations: value.observations.map(o => (o.id === id ? { ...o, ...patch } : o))
    });

  const analyze = async () => {
    if (busy) return;
    setBusy(true);
    onBusy?.(true);
    setMessage('');
    const request = ++generation.current;
    try {
      const result = await ApiClient.post<{ suggestions: Observation[] }>('/v1/personal/posture-ai/analyze', {
        patient_id: patientId,
        photos: photos.filter(p => p.fileId).map(p => ({ view: p.view, file_id: p.fileId }))
      });
      if (request === generation.current) {
        onChange({
          ...value,
          observations: [...value.observations, ...result.suggestions].slice(0, 180)
        });
        setMessage('Sugestões adicionadas como rascunho. Revisar e confirmar pelo profissional antes de incluir na evolução.');
      }
    } catch (e: any) {
      if (request === generation.current) {
        let msg = 'Não foi possível analisar as fotos.';
        const code = e?.code || '';
        const raw = String(e?.message || '');
        if (code === 'POSTURE_AI_NOT_CONFIGURED' || e?.status === 503 || raw.includes('não está configurada')) {
          msg = 'Análise por IA ainda não está configurada.';
        } else if (
          code === 'POSTURE_AI_IMAGE_ERROR' ||
          code === 'POSTURE_AI_FILE_UNAVAILABLE' ||
          (raw.includes('foto') && !raw.includes('indisponível'))
        ) {
          msg = 'Não foi possível acessar uma das fotos.';
        } else if (
          code === 'POSTURE_AI_PROVIDER_ERROR' ||
          code === 'POSTURE_AI_TIMEOUT' ||
          e?.status === 502 ||
          e?.status === 504 ||
          raw.includes('502') ||
          raw.includes('HTML') ||
          raw.includes('indisponível')
        ) {
          msg = 'O serviço de análise por IA está temporariamente indisponível.';
        } else if (e?.message && !e.message.includes('HTML') && !e.message.includes('<') && !e.message.includes('Erro 502')) {
          msg = e.message;
        }
        setMessage(msg);
      }
    } finally {
      if (request === generation.current) {
        setBusy(false);
        onBusy?.(false);
      }
    }
  };

  const hasPhoto = Boolean(photo.fileId || photo.url);
  const canDraw = hasPhoto && !mismatch && !busy;
  const currentRegionLabel = regions.find(r => r[0] === region)?.[1] || 'Cabeça / cervical';
  const viewObservations = value.observations.filter(o => o.view === view);
  const visibleObservations = showAllViewNotes
    ? viewObservations
    : viewObservations.filter(o => o.region === region);
  const attentionRegions = viewObservations.filter(o => !o.reviewed).map(o => o.region);

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
      aria-label="Avaliação Postural"
    >
      {/* 1. CABEÇALHO E ABAS DE VISÃO POSTURAL (Anterior | Posterior | Lateral D | Lateral E) */}
      <div className="bg-slate-50/90 border-b border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-sm text-slate-900">Avaliação Postural & Fotogrametria</h3>
          <p className="text-[11px] text-slate-500">
            Marcações em camada vetorial independente (a foto original permanece intacta).
          </p>
        </div>

        {/* Abas das 4 vistas */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {views.map(([id, label]) => {
            const vPhoto = photos.find(p => p.view === id);
            const vData = value.views[id];
            const vStrokesCount = vData && vData.fileId === vPhoto?.fileId ? (vData.strokes || []).length : 0;
            const vObsCount = value.observations.filter(o => o.view === id).length;
            const isSelected = view === id;
            const hasVPhoto = Boolean(vPhoto?.fileId || vPhoto?.url);

            return (
              <button
                disabled={busy}
                type="button"
                key={id}
                onClick={() => setView(id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    hasVPhoto
                      ? isSelected
                        ? 'bg-emerald-300'
                        : 'bg-emerald-500'
                      : isSelected
                      ? 'bg-white/40'
                      : 'bg-slate-300'
                  }`}
                  title={hasVPhoto ? 'Foto carregada nesta vista' : 'Sem foto nesta vista'}
                />
                <span>{label}</span>
                {(vStrokesCount > 0 || vObsCount > 0) && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                      isSelected ? 'bg-indigo-500 text-white' : 'bg-indigo-50 text-indigo-700'
                    }`}
                  >
                    {vStrokesCount + vObsCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. BARRA DE FERRAMENTAS PRINCIPAL (Modos | Histórico | Guias | Zoom) */}
      <div className="bg-slate-100/70 border-b border-slate-200 px-3 sm:px-4 py-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Modos: Navegar | Caneta | Linha | Borracha */}
          <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            {(
              [
                ['select', 'Navegar', Hand, 'Modo Navegar: mova e amplie a foto sem desenhar'],
                ['pen', 'Caneta', Pencil, 'Caneta livre: desenhe marcações anatômicas com fluidez'],
                ['line', 'Linha', Minus, 'Linha de alinhamento: clique e arraste (Shift = horizontal/vertical)'],
                ['eraser', 'Borracha', Eraser, 'Borracha: clique ou arraste sobre traços para apagá-los']
              ] as const
            ).map(([id, label, Icon, tip]) => {
              const active = tool === id;
              return (
                <button
                  disabled={!canDraw}
                  type="button"
                  key={id}
                  onClick={() => setTool(id)}
                  title={tip}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Histórico: Desfazer | Refazer | Limpar + Guias */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              disabled={!undoStack.length || busy}
              type="button"
              onClick={handleUndo}
              title="Desfazer última marcação nesta vista"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Undo2 aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Desfazer</span>
            </button>

            <button
              disabled={!redoStack.length || busy}
              type="button"
              onClick={handleRedo}
              title="Refazer marcação desfeita"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Redo2 aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Refazer</span>
            </button>

            <button
              disabled={!strokes.length || busy}
              type="button"
              onClick={handleClearStrokes}
              title="Limpar todos os desenhos desta vista preservando a foto original"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white text-rose-700 hover:bg-rose-50 border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Limpar desenho</span>
            </button>

            <label
              title="Exibir ou ocultar linhas de referência postural (não são gravadas na foto)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer select-none ${
                !mismatch && current?.guides
                  ? 'bg-sky-50 text-sky-800 border-sky-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              } ${!canDraw ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={!mismatch && Boolean(current?.guides)}
                disabled={!canDraw}
                onChange={e =>
                  onChange({
                    ...value,
                    views: {
                      ...value.views,
                      [view]: {
                        fileId: photo.fileId,
                        guides: e.target.checked,
                        strokes
                      }
                    }
                  })
                }
              />
              <Grid aria-hidden="true" className="w-3.5 h-3.5 text-sky-600" />
              <span>Guias</span>
            </label>
          </div>

          {/* Controles de Zoom: [ − ] [ 100% ] [ + ] [ Ajustar à tela ] */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              disabled={!hasPhoto || zoom <= 1}
              onClick={handleZoomOut}
              title="Diminuir zoom (−)"
              aria-label="Diminuir zoom"
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ZoomOut aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
            <span
              className="px-2 text-[11px] font-bold text-slate-700 min-w-[44px] text-center"
              title="Nível de zoom atual"
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              disabled={!hasPhoto || zoom >= 3}
              onClick={handleZoomIn}
              title="Aumentar zoom (+)"
              aria-label="Aumentar zoom"
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ZoomIn aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!hasPhoto || (zoom === 1 && pan.x === 0 && pan.y === 0)}
              onClick={handleResetZoom}
              title="Ajustar imagem à tela (100%)"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-l border-slate-100"
            >
              <Maximize2 aria-hidden="true" className="w-3 h-3" />
              <span>Ajustar à tela</span>
            </button>
          </div>
        </div>

        {/* Sub-barra contextual para Caneta, Linha ou Borracha */}
        {(tool === 'pen' || tool === 'line') && canDraw && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1.5 border-t border-slate-200/80 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Espessura */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-600">Espessura:</span>
                {(['thin', 'medium', 'thick'] as const).map(sz => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setStrokeSize(sz)}
                    title={`Espessura ${strokeSizes[sz].label.toLowerCase()}`}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      strokeSize === sz
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {strokeSizes[sz].label}
                  </button>
                ))}
              </div>

              {/* Cor */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-600">Cor:</span>
                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200">
                  {strokeColors.map(([hex, colorName]) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setStrokeColor(hex)}
                      title={`Cor: ${colorName}`}
                      aria-label={`Cor ${colorName}`}
                      className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                        strokeColor === hex
                          ? 'ring-2 ring-indigo-600 ring-offset-1 scale-110 border-slate-400'
                          : 'border-slate-300 hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center gap-2">
              <span>
                Região vinculada ao traço: <strong className="text-indigo-700">{currentRegionLabel}</strong>
              </span>
              {tool === 'line' && (
                <span className="hidden sm:inline text-slate-400">• Dica: segure Shift para linha horizontal/vertical</span>
              )}
            </div>
          </div>
        )}

        {tool === 'eraser' && canDraw && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1.5 border-t border-slate-200/80 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-600">Tamanho da borracha:</span>
              {(['thin', 'medium', 'thick'] as const).map(sz => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setStrokeSize(sz)}
                  title={`Borracha ${strokeSizes[sz].eraserLabel.toLowerCase()}`}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                    strokeSize === sz
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {strokeSizes[sz].eraserLabel}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500">
              Clique ou arraste sobre as marcações para apagá-las. A foto original nunca é alterada.
            </span>
          </div>
        )}
      </div>

      {/* Alerta de divergência de foto */}
      {mismatch && (
        <div className="mx-4 mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between flex-wrap gap-2">
          <span>Esta vista possui marcações vinculadas a uma foto anterior.</span>
          <button
            type="button"
            disabled={busy}
            className="font-bold underline cursor-pointer"
            onClick={() => updateStrokes([])}
          >
            Descartar traços anteriores e usar a foto atual
          </button>
        </div>
      )}

      {/* 3. CORPO PRINCIPAL: 70% IMAGEM GRANDE + 30% PAINEL DE REGIÕES E OBSERVAÇÕES */}
      <div className="p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Área Principal da Foto (70% no desktop = 8 colunas de 12) */}
        <div className="lg:col-span-8 space-y-2.5 min-w-0">
          {renderViewUploader && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
              {renderViewUploader(view)}
            </div>
          )}

          <PosturePhotoCanvas
            key={`${view}:${photo.fileId}`}
            attentionRegions={attentionRegions}
            photo={photo}
            strokes={strokes}
            guides={!mismatch && current?.guides}
            tool={busy || mismatch ? 'select' : tool}
            strokeColor={strokeColor}
            strokeSize={strokeSize}
            activeRegion={region}
            zoom={zoom}
            pan={pan}
            onPanChange={setPan}
            onStrokes={busy || mismatch ? undefined : updateStrokes}
            onRegion={busy ? undefined : add}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 px-1">
            <span>
              Vista atual: <strong className="text-slate-700">{views.find(v => v[0] === view)?.[1]}</strong> •{' '}
              {strokes.length} {strokes.length === 1 ? 'marcação' : 'marcações'} nesta vista
            </span>
            <span>
              Modo ativo:{' '}
              <strong className="text-indigo-700">
                {tool === 'select'
                  ? 'Navegar (Pan/Zoom)'
                  : tool === 'pen'
                  ? 'Caneta'
                  : tool === 'line'
                  ? 'Linha'
                  : 'Borracha'}
              </strong>
            </span>
          </div>
        </div>

        {/* Painel Lateral: Regiões, Observações e Assistente IA (30% no desktop = 4 colunas de 12) */}
        <aside className="lg:col-span-4 bg-slate-50/70 rounded-2xl border border-slate-200 p-3.5 space-y-3.5 min-w-0">
          {/* Seleção de Região */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              Região Anatômica
              <select
                aria-label="Região postural"
                value={region}
                disabled={busy}
                onChange={e => {
                  setRegion(e.target.value as Region);
                  setShowAllViewNotes(false);
                }}
                className="block w-full bg-white border border-slate-200 rounded-xl px-3 py-2 mt-1 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {regions.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label} ({value.observations.filter(o => o.region === id && o.view === view).length})
                  </option>
                ))}
              </select>
            </label>

            {/* Atalhos rápidos de regiões (substituindo os antigos botões "+" soltos sobre a foto) */}
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Atalho rápido por região (+ observação)
              </span>
              <div className="flex flex-wrap gap-1">
                {regions.map(([id, label]) => {
                  const count = value.observations.filter(o => o.region === id && o.view === view).length;
                  const hasPending = attentionRegions.includes(id);
                  const isCurrent = region === id;
                  return (
                    <button
                      type="button"
                      key={id}
                      disabled={busy}
                      aria-label={`Adicionar observação: ${label}`}
                      title={`Selecionar ${label} e adicionar observação`}
                      onClick={() => add(id)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
                        hasPending
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : isCurrent
                          ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>+ {label}</span>
                      {count > 0 && (
                        <span className="px-1 rounded bg-slate-100 text-slate-700 font-bold">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cabeçalho de Observações + Botão Adicionar */}
          <div className="pt-2 border-t border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">
                Observações ({visibleObservations.length})
              </span>
              {viewObservations.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllViewNotes(prev => !prev)}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                >
                  {showAllViewNotes ? 'Filtrar pela região selecionada' : `Ver todas da vista (${viewObservations.length})`}
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={busy || value.observations.length >= 180}
              onClick={() => add(region)}
              className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Adicionar observação ({currentRegionLabel})</span>
            </button>
          </div>

          {/* Lista de Cards de Observação */}
          <div className="max-h-[420px] overflow-y-auto space-y-2.5 pr-0.5">
            {visibleObservations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">
                Nenhuma observação registrada para <strong>{currentRegionLabel}</strong> nesta vista.
              </div>
            ) : (
              visibleObservations.map(o => {
                const regLabel = regions.find(r => r[0] === o.region)?.[1] || o.region;
                return (
                  <div
                    className={`rounded-xl border p-3 space-y-2 bg-white shadow-2xs ${
                      o.source === 'ai' && !o.reviewed ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'
                    }`}
                    key={o.id}
                  >
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                        {regLabel}
                      </span>
                      {o.source === 'ai' ? (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            o.reviewed
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          Sugestão de IA • {o.reviewed ? 'revisada' : 'aguarda revisão'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          Registrada pelo profissional
                        </span>
                      )}
                    </div>

                    <textarea
                      aria-label="Observação postural"
                      value={o.text}
                      maxLength={1200}
                      disabled={busy}
                      onChange={e => edit(o.id, { text: e.target.value })}
                      rows={2}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                      placeholder="Registre o achado visual e o contexto clínico desta região..."
                    />

                    <label className="block text-[11px] font-medium text-slate-600">
                      Em relação à avaliação inicial
                      <select
                        aria-label="Evolução em relação à inicial"
                        value={o.evolution}
                        disabled={busy || !o.reviewed}
                        onChange={e => edit(o.id, { evolution: e.target.value as Observation['evolution'] })}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 mt-1 text-xs bg-white font-semibold text-slate-700"
                      >
                        {Object.entries(evolutionLabels).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      {o.source === 'ai' && !o.reviewed ? (
                        <button
                          type="button"
                          disabled={busy || !o.text.trim()}
                          onClick={() => edit(o.id, { reviewed: true })}
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer disabled:opacity-40"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirmar revisão</span>
                        </button>
                      ) : (
                        <span />
                      )}

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          onChange({
                            ...value,
                            observations: value.observations.filter(item => item.id !== o.id)
                          })
                        }
                        className="text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                      >
                        Excluir observação
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/80">
            {value.observations.filter(o => o.reviewed && o.text.trim()).length} observações revisadas •{' '}
            {value.observations.filter(o => !o.reviewed).length} pendentes. Classificação definida pelo profissional.
          </p>

          {/* Assistente IA (Apoio visual sujeito a revisão profissional) */}
          <div className="pt-2 border-t border-slate-200/80 space-y-2">
            <button
              type="button"
              disabled={busy || !ai.available || !photos.some(p => p.fileId) || value.observations.length >= 180}
              onClick={analyze}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{busy ? 'Analisando postura...' : 'Analisar postura com IA'}</span>
            </button>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              {ai.available
                ? photos.some(p => p.fileId)
                  ? 'Gera rascunho de pontos para revisão visual. Revisar e confirmar pelo profissional (não realiza diagnóstico automático).'
                  : 'Adicione pelo menos uma foto corporal para habilitar o auxílio visual por IA.'
                : ai.reason || 'Verificando disponibilidade da IA…'}
            </p>
            {message && (
              <p role="status" className="text-xs font-medium text-indigo-800 bg-indigo-50 p-2 rounded-lg border border-indigo-200">
                {message}
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
