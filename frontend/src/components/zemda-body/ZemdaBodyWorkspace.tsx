import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { BodyRegionDef } from './bodyRegionsData';
import { ZemdaBodyCanvas, BodyStroke, BodyMarkerItem } from './ZemdaBodyCanvas';
import { ZemdaBodyPanel } from './ZemdaBodyPanel';
import {
  MousePointer,
  PenTool,
  Highlighter,
  Eraser,
  RotateCcw,
  RotateCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  User,
  Layers,
  Sparkles,
  HelpCircle
} from 'lucide-react';

interface ZemdaBodyWorkspaceProps {
  patientId: string;
  appointmentId?: string;
  professionalId?: string;
  module?: string;
  initialBodyModel?: 'female' | 'male';
  readOnly?: boolean;
  onClose?: () => void;
}

export const ZemdaBodyWorkspace: React.FC<ZemdaBodyWorkspaceProps> = ({
  patientId,
  appointmentId,
  professionalId,
  module = 'general',
  initialBodyModel = 'female',
  readOnly = false,
  onClose
}) => {
  const { showToast } = useToast();

  // Estado da Avaliação
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [bodyModel, setBodyModel] = useState<'female' | 'male'>(initialBodyModel);
  const [activeView, setActiveView] = useState<'front' | 'back' | 'left' | 'right' | 'all'>('front');
  const [loading, setLoading] = useState<boolean>(true);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Marcadores e Desenhos
  const [markers, setMarkers] = useState<BodyMarkerItem[]>([]);
  const [drawings, setDrawings] = useState<Record<string, BodyStroke[]>>({
    front: [],
    back: [],
    left: [],
    right: []
  });

  // Ferramenta Ativa
  const [tool, setTool] = useState<'select' | 'pen' | 'highlighter' | 'eraser'>('select');
  const [penColor, setPenColor] = useState<string>('#dc2626'); // Vermelho padrão
  const [penWidth, setPenWidth] = useState<number>(4); // Média
  const [highlighterWidth, setHighlighterWidth] = useState<number>(18);

  // Região Selecionada
  const [selectedRegion, setSelectedRegion] = useState<BodyRegionDef | null>(null);

  // Confirmação de Limpar Desenho
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  // Timer de debounce para salvar desenhos
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega avaliação existente ou inicializa
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        let res: any = null;

        if (appointmentId) {
          res = await ApiClient.get<any>(`/v1/body-assessments/appointment/${appointmentId}`);
        }

        if (res?.assessment) {
          setAssessmentId(res.assessment.id);
          if (res.assessment.body_model) {
            setBodyModel(res.assessment.body_model);
          }
          setMarkers(res.markers || []);
          setDrawings({
            front: res.drawings?.front || [],
            back: res.drawings?.back || [],
            left: res.drawings?.left || [],
            right: res.drawings?.right || []
          });
        } else if (!readOnly) {
          // Cria uma nova avaliação vinculada ao agendamento
          const createRes = await ApiClient.post<any>('/v1/body-assessments', {
            patientId,
            appointmentId: appointmentId || null,
            professionalId: professionalId || null,
            module,
            bodyModel,
            assessmentDate: new Date().toISOString().split('T')[0]
          });
          if (createRes?.assessmentId) {
            setAssessmentId(createRes.assessmentId);
          }
        }
      } catch (err: any) {
        console.error('Erro ao carregar mapa corporal:', err);
        showToast('Erro ao carregar registros do ZemdaBody', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [patientId, appointmentId, professionalId, module, readOnly]);

  // Alteração de modelo corporal
  const handleModelChange = async (newModel: 'female' | 'male') => {
    setBodyModel(newModel);
    if (assessmentId && !readOnly) {
      try {
        await ApiClient.post('/v1/body-assessments', {
          id: assessmentId,
          patientId,
          appointmentId: appointmentId || null,
          professionalId: professionalId || null,
          module,
          bodyModel: newModel
        });
      } catch (e) {
        console.warn('Erro ao atualizar modelo:', e);
      }
    }
  };

  // Salvar Marcador Clínico Estruturado
  const handleAddMarker = async (newMarker: Omit<BodyMarkerItem, 'id'>) => {
    if (!assessmentId) {
      showToast('Avaliação corporal não inicializada', 'error');
      return;
    }

    try {
      const res = await ApiClient.post<any>(`/v1/body-assessments/${assessmentId}/markers`, newMarker);
      if (res?.markerId) {
        const fullMarker: BodyMarkerItem = {
          ...newMarker,
          id: res.markerId
        };
        setMarkers(prev => [...prev, fullMarker]);
        showToast('Informação clínica registrada no mapa!', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar marcador', 'error');
      throw err;
    }
  };

  // Excluir Marcador
  const handleDeleteMarker = async (markerId: string) => {
    try {
      await ApiClient.delete(`/v1/body-assessments/markers/${markerId}`);
      setMarkers(prev => prev.filter(m => m.id !== markerId));
      showToast('Registro excluído com sucesso', 'info');
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir registro', 'error');
    }
  };

  // Salvar Desenhos com Debounce para evitar sobrecarregar API
  const handleSaveViewDrawings = useCallback(
    (view: 'front' | 'back' | 'left' | 'right', strokes: BodyStroke[]) => {
      // Atualização imediata no estado local
      setDrawings(prev => ({
        ...prev,
        [view]: strokes
      }));

      if (!assessmentId || readOnly) return;

      setSavingStatus('saving');
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        try {
          await ApiClient.put(`/v1/body-assessments/${assessmentId}/drawings/${view}`, {
            strokes
          });
          setSavingStatus('saved');
          setTimeout(() => setSavingStatus('idle'), 2000);
        } catch (err) {
          console.error('Erro ao sincronizar desenhos:', err);
          setSavingStatus('error');
        }
      }, 700);
    },
    [assessmentId, readOnly]
  );

  // Confirmar Limpar Desenho da Vista Ativa
  const handleConfirmClearView = async () => {
    if (activeView === 'all') {
      showToast('Selecione uma vista específica para limpar', 'info');
      setShowClearConfirm(false);
      return;
    }

    const viewToClear = activeView;
    try {
      if (assessmentId && !readOnly) {
        await ApiClient.delete(`/v1/body-assessments/${assessmentId}/drawings/${viewToClear}`);
      }
      setDrawings(prev => ({
        ...prev,
        [viewToClear]: []
      }));
      showToast(`Anotações manuais da vista ${viewToClear} removidas`, 'info');
    } catch (err: any) {
      showToast('Erro ao limpar anotações', 'error');
    } finally {
      setShowClearConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 bg-slate-50 rounded-2xl">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-600">Carregando ZemdaBody...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. BARRA DE FERRAMENTAS SUPERIOR DO ZEMDABODY */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Lado Esquerdo: Ferramentas de Interação */}
        <div className="flex items-center flex-wrap gap-1.5">
          {/* Selecionar */}
          <button
            type="button"
            onClick={() => setTool('select')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tool === 'select'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="Modo Seleção: clique no corpo para registrar ou consultar dados estruturados"
          >
            <MousePointer className="w-4 h-4" />
            <span>Selecionar</span>
          </button>

          {!readOnly && (
            <>
              {/* Caneta Clínica */}
              <button
                type="button"
                onClick={() => setTool('pen')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  tool === 'pen'
                    ? 'bg-teal-600 text-white shadow-xs shadow-teal-500/20'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title="Caneta Clínica: desenhe círculos, setas, áreas de dor ou escreva anotações livres"
              >
                <PenTool className="w-4 h-4" />
                <span>Caneta</span>
              </button>

              {/* Marca-texto */}
              <button
                type="button"
                onClick={() => setTool('highlighter')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  tool === 'highlighter'
                    ? 'bg-amber-500 text-white shadow-xs shadow-amber-500/20'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title="Marca-texto: destaque semitransparente sobre regiões amplas"
              >
                <Highlighter className="w-4 h-4" />
                <span>Marca-texto</span>
              </button>

              {/* Borracha */}
              <button
                type="button"
                onClick={() => setTool('eraser')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  tool === 'eraser'
                    ? 'bg-rose-600 text-white shadow-xs shadow-rose-500/20'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title="Borracha: clique sobre traços manuais para apagá-los (não remove marcadores)"
              >
                <Eraser className="w-4 h-4" />
                <span>Borracha</span>
              </button>

              {/* Separador */}
              <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

              {/* Limpar Desenho */}
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Limpar todas as anotações manuais desta vista"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Limpar vista</span>
              </button>
            </>
          )}

          {/* Indicador do Modo Atual */}
          <div className="hidden lg:flex items-center pl-2">
            <span className="text-[11px] font-semibold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              Modo atual: <strong className="text-slate-700">{
                tool === 'select' ? 'Seleção Anatômica' :
                tool === 'pen' ? 'Caneta Clínica' :
                tool === 'highlighter' ? 'Marca-texto' : 'Borracha'
              }</strong>
            </span>
          </div>
        </div>

        {/* Lado Direito: Seletores de Modelo e Vistas */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Seletor de Modelo Corporal */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => handleModelChange('female')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                bodyModel === 'female'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Feminino
            </button>
            <button
              type="button"
              onClick={() => handleModelChange('male')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                bodyModel === 'male'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Masculino
            </button>
          </div>

          {/* Status de Sincronização */}
          {savingStatus === 'saving' && (
            <span className="text-[11px] font-semibold text-amber-600 animate-pulse flex items-center gap-1">
              Sincronizando...
            </span>
          )}
          {savingStatus === 'saved' && (
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Salvo
            </span>
          )}
        </div>
      </div>

      {/* 2. SUB-BARRA CONTEXTUAL: OPÇÕES DA CANETA / VISTAS */}
      <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
        {/* Seletor de Vistas Corporais */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-bold text-slate-500 mr-1.5 hidden sm:inline">Vista:</span>
          {[
            { id: 'front', label: 'Frente' },
            { id: 'back', label: 'Verso' },
            { id: 'left', label: 'Lado esquerdo' },
            { id: 'right', label: 'Lado direito' },
            { id: 'all', label: 'Panorama (4 Vistas)' }
          ].map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setActiveView(v.id as any);
                setSelectedRegion(null);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeView === v.id
                  ? 'bg-white text-teal-700 shadow-xs border border-teal-200 font-extrabold'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Cores e Espessuras da Caneta (visível quando caneta está ativa) */}
        {tool === 'pen' && !readOnly && (
          <div className="flex items-center gap-2">
            {/* Cores Clínicas Discretas */}
            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-slate-200">
              {[
                { hex: '#dc2626', name: 'Vermelho' },
                { hex: '#2563eb', name: 'Azul' },
                { hex: '#16a34a', name: 'Verde' },
                { hex: '#ea580c', name: 'Laranja' },
                { hex: '#1e293b', name: 'Preto' }
              ].map(c => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setPenColor(c.hex)}
                  className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                    penColor === c.hex ? 'scale-125 ring-2 ring-slate-400' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                />
              ))}
            </div>

            {/* Espessuras */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setPenWidth(2)}
                className={`px-2 py-0.5 rounded-lg font-medium ${penWidth === 2 ? 'bg-slate-200 text-slate-900 font-bold' : 'text-slate-600'}`}
              >
                Fina
              </button>
              <button
                type="button"
                onClick={() => setPenWidth(4)}
                className={`px-2 py-0.5 rounded-lg font-medium ${penWidth === 4 ? 'bg-slate-200 text-slate-900 font-bold' : 'text-slate-600'}`}
              >
                Média
              </button>
              <button
                type="button"
                onClick={() => setPenWidth(8)}
                className={`px-2 py-0.5 rounded-lg font-medium ${penWidth === 8 ? 'bg-slate-200 text-slate-900 font-bold' : 'text-slate-600'}`}
              >
                Grossa
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. ÁREA PRINCIPAL: MAPA CORPORAL + PAINEL LATERAL CONTEXTUAL */}
      <div className="relative flex flex-col lg:flex-row items-start justify-center gap-5 min-h-[550px]">
        {/* Canvas do ZemdaBody */}
        <div className="flex-1 w-full flex justify-center">
          <ZemdaBodyCanvas
            bodyModel={bodyModel}
            activeView={activeView}
            tool={tool}
            penColor={penColor}
            penWidth={penWidth}
            highlighterWidth={highlighterWidth}
            selectedRegionId={selectedRegion?.id || null}
            onSelectRegion={setSelectedRegion}
            markers={markers}
            drawings={drawings}
            onSaveViewDrawings={handleSaveViewDrawings}
            readOnly={readOnly}
          />
        </div>

        {/* Painel Lateral Contextual da Região */}
        {selectedRegion && (
          <div className="w-full lg:w-96 shrink-0">
            <ZemdaBodyPanel
              region={selectedRegion}
              module={module}
              markers={markers}
              onClose={() => setSelectedRegion(null)}
              onAddMarker={handleAddMarker}
              onDeleteMarker={handleDeleteMarker}
              readOnly={readOnly}
            />
          </div>
        )}
      </div>

      {/* 4. MODAL DE CONFIRMAÇÃO PARA LIMPAR DESENHOS DA VISTA */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Limpar Anotações Manuais?</h4>
                <p className="text-xs text-slate-500">Vista: {activeView}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Deseja remover todas as anotações manuais desta vista? Os registros estruturados, EVA e observações permanecerão intactos.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmClearView}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Sim, Limpar Desenhos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
