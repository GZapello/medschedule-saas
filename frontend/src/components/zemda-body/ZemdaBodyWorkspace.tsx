import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { ZemdaBodyCanvas, BodyStroke } from './ZemdaBodyCanvas';
import { getRegionLabel } from './bodyRegionsData';
import { AnthropometricAssessmentView } from './AnthropometricAssessmentView';
import { TherapeuticPlanView } from './TherapeuticPlanView';
import {
  MousePointer,
  PenTool,
  Eraser,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Save,
  User,
  Tag,
  FileText,
  ShieldCheck,
  Scale,
  ClipboardList
} from 'lucide-react';

interface ZemdaBodyWorkspaceProps {
  patientId: string;
  initialAssessmentId?: string;
  appointmentId?: string;
  professionalId?: string;
  module?: string;
  initialBodyModel?: 'female' | 'male';
  readOnly?: boolean;
  onClose?: () => void;
}

export const ZemdaBodyWorkspace: React.FC<ZemdaBodyWorkspaceProps> = ({
  patientId,
  initialAssessmentId,
  appointmentId,
  professionalId,
  module = 'general',
  initialBodyModel = 'female',
  readOnly = false,
  onClose
}) => {
  const { showToast } = useToast();

  // Estados principais da Avaliação
  const [assessmentId, setAssessmentId] = useState<string | null>(initialAssessmentId || null);
  const assessmentIdRef = useRef<string | null>(initialAssessmentId || null);
  const [bodyModel, setBodyModel] = useState<'female' | 'male'>(initialBodyModel);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [drawings, setDrawings] = useState<BodyStroke[]>([]);
  const [clinicalNotes, setClinicalNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (initialAssessmentId) {
      setAssessmentId(initialAssessmentId);
      assessmentIdRef.current = initialAssessmentId;
    }
  }, [initialAssessmentId]);

  // Identificação automática da profissão do usuário logado
  const { isNutritionist, isZemdaNutri } = useAuth();
  const isNutriUser = Boolean(isNutritionist || isZemdaNutri || module === 'nutrition' || module === 'nutri');
  const [activeSection, setActiveSection] = useState<'anthropometry' | 'therapeutic'>(
    isNutriUser ? 'anthropometry' : 'therapeutic'
  );

  useEffect(() => {
    setActiveSection(isNutriUser ? 'anthropometry' : 'therapeutic');
  }, [isNutriUser]);

  // Ferramenta Ativa (apenas uma por vez: selecionar | caneta | borracha)
  const [tool, setTool] = useState<'select' | 'pen' | 'eraser'>('select');
  const [penColor, setPenColor] = useState<string>('#dc2626');
  const [penWidth, setPenWidth] = useState<number>(4);

  // Modal de confirmação para limpar somente os traços da caneta
  const [showClearDrawingsConfirm, setShowClearDrawingsConfirm] = useState<boolean>(false);

  // Timer de debounce para persistência automática
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega avaliação existente ou inicializa nova
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        let res: any = null;

        const targetId = initialAssessmentId || assessmentIdRef.current;
        if (targetId) {
          res = await ApiClient.get<any>(`/v1/body-assessments/${targetId}`);
        } else if (appointmentId) {
          res = await ApiClient.get<any>(`/v1/body-assessments/appointment/${appointmentId}`);
        }

        if (res?.assessment) {
          setAssessmentId(res.assessment.id);
          assessmentIdRef.current = res.assessment.id;
          if (res.assessment.body_model) {
            setBodyModel(res.assessment.body_model);
          }

          let loadedRegions: string[] = [];
          let loadedDrawings: BodyStroke[] = [];

          if (res.assessment.notes) {
            try {
              const parsed = JSON.parse(res.assessment.notes);
              if (Array.isArray(parsed)) {
                loadedRegions = parsed;
              } else if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.selectedRegions)) {
                  loadedRegions = parsed.selectedRegions;
                }
                if (Array.isArray(parsed.drawings)) {
                  loadedDrawings = parsed.drawings;
                }
                if (parsed.clinicalNotes) {
                  setClinicalNotes(parsed.clinicalNotes);
                }
              } else {
                setClinicalNotes(res.assessment.notes);
              }
            } catch {
              setClinicalNotes(res.assessment.notes);
            }
          }

          // Se não havia nos notes, carrega de body_markers
          if (loadedRegions.length === 0 && Array.isArray(res.markers) && res.markers.length > 0) {
            loadedRegions = res.markers
              .filter((m: any) => m.body_region)
              .map((m: any) => m.body_region);
          }

          // Se não havia nos notes, carrega de body_drawings
          if (loadedDrawings.length === 0 && res.drawings) {
            if (Array.isArray(res.drawings.front) && res.drawings.front.length > 0) {
              loadedDrawings = res.drawings.front;
            } else if (Array.isArray(res.drawings.all) && res.drawings.all.length > 0) {
              loadedDrawings = res.drawings.all;
            }
          }

          setSelectedRegions(loadedRegions);
          setDrawings(loadedDrawings);
        }
      } catch (err: any) {
        console.error('Erro ao carregar mapa corporal:', err);
        showToast('Erro ao carregar registros do ZemdaBody', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [patientId, initialAssessmentId, appointmentId, professionalId, module, readOnly]);

  // Função central de persistência
  const saveAssessmentData = useCallback(
    async (
      regionsToSave: string[],
      drawingsToSave: BodyStroke[],
      notesToSave: string,
      modelToSave: 'female' | 'male',
      isManual: boolean = false
    ) => {
      if (readOnly) return;

      try {
        setSavingStatus('saving');

        const notesPayload = JSON.stringify({
          selectedRegions: regionsToSave,
          drawings: drawingsToSave,
          clinicalNotes: notesToSave
        });

        const currentActiveId = assessmentIdRef.current;

        const res = await ApiClient.post<any>('/v1/body-assessments', {
          id: currentActiveId || undefined,
          patientId,
          appointmentId: appointmentId || null,
          professionalId: professionalId || null,
          module,
          bodyModel: modelToSave,
          notes: notesPayload,
          assessmentDate: new Date().toISOString().split('T')[0]
        });

        const activeId = currentActiveId || res?.assessmentId;
        if (res?.assessmentId) {
          assessmentIdRef.current = res.assessmentId;
          setAssessmentId(res.assessmentId);
        }

        // Sincroniza também com body_drawings para redundância
        if (activeId) {
          ApiClient.put(`/v1/body-assessments/${activeId}/drawings/front`, {
            strokes: drawingsToSave
          }).catch(() => {});

          // Sincroniza marcadores individuais em body_markers
          for (const regId of regionsToSave) {
            const side = regId.includes('direito')
              ? 'right'
              : regId.includes('esquerdo')
              ? 'left'
              : 'midline';
            const view = regId.startsWith('verso')
              ? 'back'
              : regId.startsWith('perfil_esq')
              ? 'left'
              : regId.startsWith('perfil_dir')
              ? 'right'
              : 'front';

            ApiClient.post(`/v1/body-assessments/${activeId}/markers`, {
              id: `${activeId}_${regId}`,
              bodyRegion: regId,
              side,
              view,
              markerType: 'selected_region',
              value: regId
            }).catch(() => {});
          }
        }

        setSavingStatus('saved');
        if (isManual) {
          showToast('Avaliação corporal e desenhos salvos com sucesso!', 'success');
        }
        setTimeout(() => setSavingStatus('idle'), 2500);
      } catch (err: any) {
        console.error('Erro ao salvar avaliação:', err);
        setSavingStatus('error');
        if (isManual) {
          showToast('Erro ao salvar mapa corporal', 'error');
        }
      }
    },
    [patientId, appointmentId, professionalId, module, readOnly, showToast]
  );

  // Debounce para persistência automática
  const triggerAutoSave = (
    newRegions: string[],
    newDrawings: BodyStroke[] = drawings,
    newNotes: string = clinicalNotes,
    newModel: 'female' | 'male' = bodyModel
  ) => {
    if (readOnly) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      saveAssessmentData(newRegions, newDrawings, newNotes, newModel, false);
    }, 600);
  };

  // Alternar região corporal (clique sobre o SVG no modo 'select')
  const handleToggleRegion = (regionId: string) => {
    if (readOnly) return;

    let updated: string[];
    if (selectedRegions.includes(regionId)) {
      updated = selectedRegions.filter(id => id !== regionId);
      if (assessmentId) {
        ApiClient.delete(`/v1/body-assessments/markers/${assessmentId}_${regionId}`).catch(() => {});
      }
    } else {
      updated = [...selectedRegions, regionId];
    }

    setSelectedRegions(updated);
    triggerAutoSave(updated, drawings, clinicalNotes, bodyModel);
  };

  // Salvar novos traços desenhados ou apagados
  const handleSaveDrawings = (newDrawings: BodyStroke[]) => {
    setDrawings(newDrawings);
    triggerAutoSave(selectedRegions, newDrawings, clinicalNotes, bodyModel);
  };

  // Limpar somente as anotações da caneta (sem alterar regiões selecionadas)
  const handleConfirmClearDrawings = () => {
    if (readOnly) return;
    setDrawings([]);
    triggerAutoSave(selectedRegions, [], clinicalNotes, bodyModel);
    setShowClearDrawingsConfirm(false);
    showToast('Desenhos manuais removidos (as regiões corporais marcadas continuam intactas)', 'info');
  };

  // Desmarcar todas as regiões corporais
  const handleClearAllRegions = () => {
    if (readOnly || selectedRegions.length === 0) return;
    if (confirm('Deseja desmarcar todas as regiões corporais selecionadas?')) {
      setSelectedRegions([]);
      triggerAutoSave([], drawings, clinicalNotes, bodyModel);
      showToast('Seleções corporais desmarcadas', 'info');
    }
  };

  // Alternar modelo (Feminino / Masculino)
  const handleModelChange = (newModel: 'female' | 'male') => {
    setBodyModel(newModel);
    triggerAutoSave(selectedRegions, drawings, clinicalNotes, newModel);
  };

  // Salvar manualmente
  const handleManualSave = () => {
    saveAssessmentData(selectedRegions, drawings, clinicalNotes, bodyModel, true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 bg-slate-50 rounded-2xl">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-600">Carregando mapa corporal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. BARRA DE FERRAMENTAS: SELEÇÃO, CANETA, BORRACHA E MODELO */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Lado Esquerdo: Controle de Modo (Selecionar, Caneta, Borracha) */}
        <div data-tour="body-tool-selector" className="flex items-center flex-wrap gap-1.5">
          {/* Modo Selecionar */}
          <button
            type="button"
            onClick={() => setTool('select')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tool === 'select'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="Modo Seleção: clique diretamente sobre as áreas corporais para marcá-las"
          >
            <MousePointer className="w-4 h-4" />
            <span>Selecionar</span>
          </button>

          {!readOnly && (
            <>
              {/* Modo Caneta */}
              <button
                type="button"
                onClick={() => setTool('pen')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  tool === 'pen'
                    ? 'bg-teal-600 text-white shadow-xs shadow-teal-500/20'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title="Modo Caneta: desenhe curvas, círculos ou escreva livremente sobre o corpo"
              >
                <PenTool className="w-4 h-4" />
                <span>Caneta</span>
              </button>

              {/* Modo Borracha */}
              <button
                type="button"
                onClick={() => setTool('eraser')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  tool === 'eraser'
                    ? 'bg-rose-600 text-white shadow-xs shadow-rose-500/20'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title="Modo Borracha: apaga exclusivamente trechos desenhados pela caneta"
              >
                <Eraser className="w-4 h-4" />
                <span>Borracha</span>
              </button>

              {/* Limpar somente traços da caneta */}
              {drawings.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClearDrawingsConfirm(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Limpar todos os desenhos da caneta (preserva as áreas selecionadas)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Limpar traços</span>
                </button>
              )}
            </>
          )}

          {/* Opções de Caneta: Cores e Espessuras */}
          {tool === 'pen' && !readOnly && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              {/* Cores */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
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
                    className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                      penColor === c.hex ? 'scale-125 ring-2 ring-slate-400' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>

              {/* Espessuras */}
              <div className="flex items-center bg-slate-50 p-0.5 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setPenWidth(2)}
                  className={`px-2 py-0.5 rounded-lg font-medium cursor-pointer ${penWidth === 2 ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600'}`}
                >
                  Fina
                </button>
                <button
                  type="button"
                  onClick={() => setPenWidth(4)}
                  className={`px-2 py-0.5 rounded-lg font-medium cursor-pointer ${penWidth === 4 ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600'}`}
                >
                  Média
                </button>
                <button
                  type="button"
                  onClick={() => setPenWidth(8)}
                  className={`px-2 py-0.5 rounded-lg font-medium cursor-pointer ${penWidth === 8 ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600'}`}
                >
                  Grossa
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lado Direito: Modelo Corporal & Salvamento */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Seletor de Modelo */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => handleModelChange('female')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                bodyModel === 'female'
                  ? 'bg-white text-teal-700 shadow-xs'
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
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Masculino
            </button>
          </div>

          {/* Status de Sincronização */}
          {savingStatus === 'saving' && (
            <span className="text-xs font-semibold text-amber-600 animate-pulse flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              Sincronizando...
            </span>
          )}
          {savingStatus === 'saved' && (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Salvo
            </span>
          )}
          {savingStatus === 'error' && (
            <span className="text-xs font-semibold text-rose-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> Erro ao salvar
            </span>
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={handleManualSave}
              disabled={savingStatus === 'saving'}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Avaliação</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. MAPA CORPORAL PANORÂMICO INTERATIVO (3 CAMADAS: IMAGEM, SVG E CANVAS) */}
      <div data-tour="body-canvas-container" className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex justify-center overflow-hidden">
        <ZemdaBodyCanvas
          bodyModel={bodyModel}
          selectedRegions={selectedRegions}
          onToggleRegion={handleToggleRegion}
          tool={tool}
          penColor={penColor}
          penWidth={penWidth}
          drawings={drawings}
          onSaveDrawings={handleSaveDrawings}
          readOnly={readOnly}
        />
      </div>

      {/* 3. RESUMO DAS REGIÕES SELECIONADAS & OBSERVAÇÕES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Áreas Marcadas */}
        <div className="lg:col-span-2 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-rose-500" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Áreas Corporais Selecionadas
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                {selectedRegions.length}
              </span>
            </div>

            {!readOnly && selectedRegions.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllRegions}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
              >
                Desmarcar todas
              </button>
            )}
          </div>

          {selectedRegions.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">
              Nenhuma região marcada. No modo <strong>Selecionar</strong>, clique diretamente sobre o corpo para registrar as áreas afetadas.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {selectedRegions.map(regId => {
                const label = getRegionLabel(regId, bodyModel);
                return (
                  <span
                    key={regId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-rose-50 text-rose-900 border border-rose-200 animate-in fade-in"
                  >
                    <span>{label}</span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleToggleRegion(regId)}
                        className="text-rose-400 hover:text-rose-700 hover:bg-rose-100 rounded-md p-0.5 transition-colors cursor-pointer"
                        title={`Remover ${label}`}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Observações Clínicas Opcionais */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-600" />
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Observações Clínicas
            </h4>
          </div>

          <textarea
            value={clinicalNotes}
            onChange={e => {
              setClinicalNotes(e.target.value);
              triggerAutoSave(selectedRegions, drawings, e.target.value);
            }}
            disabled={readOnly}
            placeholder={
              readOnly
                ? 'Sem observações adicionais.'
                : 'Observações sobre queixas, dor, intensidade, amplitude ou evolução clínica...'
            }
            rows={3}
            className="w-full text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-75 resize-none"
          />
        </div>
      </div>

      {/* 4. SEÇÃO CLÍNICA ESPECIALIZADA POR PROFISSÃO */}
      <div className="space-y-4 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Módulo Especializado ZemdaBody:
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {isNutriUser ? 'Nutrição (Identificado)' : 'Área da Saúde (Identificado)'}
            </span>
          </div>

          {/* Abas para alternar se necessário */}
          <div data-tour="body-section-selector" className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveSection('anthropometry')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSection === 'anthropometry'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Avaliação Antropométrica</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('therapeutic')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSection === 'therapeutic'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Plano Terapêutico</span>
            </button>
          </div>
        </div>

        {activeSection === 'anthropometry' ? (
          <AnthropometricAssessmentView
            patientId={patientId}
            appointmentId={appointmentId}
            patientSex={bodyModel}
            readOnly={readOnly}
          />
        ) : (
          <TherapeuticPlanView
            patientId={patientId}
            appointmentId={appointmentId}
            readOnly={readOnly}
          />
        )}
      </div>

      {/* 5. MODAL DE CONFIRMAÇÃO: LIMPAR DESENHOS DA CANETA */}
      {showClearDrawingsConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Limpar Desenhos da Caneta?</h4>
                <p className="text-xs text-slate-500">Esta ação remove apenas os traços desenhados.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Deseja apagar todas as anotações manuais feitas com a Caneta? As <strong>áreas corporais selecionadas</strong> e as <strong>observações</strong> continuarão salvas normalmente.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearDrawingsConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmClearDrawings}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Sim, Limpar Traços
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
