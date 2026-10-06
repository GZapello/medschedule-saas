import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { ZemdaBodyCanvas, BodyStroke } from './ZemdaBodyCanvas';
import { anatomicalLabel as getRegionLabel, canonicalRegion, bodyAnatomicalRegions, REGION_TAXONOMY, FACE_VIEWS } from './anatomicalRegions';
import { AnatomicalMapCanvas } from './AnatomicalMapCanvas';
import { AnatomicalRegionPanel } from './AnatomicalRegionPanel';
import { AnatomicalRecordPreview } from './AnatomicalRecordPreview';
import { useAnatomicalAssessment } from './useAnatomicalAssessment';
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
  onAssessmentSaved?: (id: string) => void;
  patientId: string;
  initialAssessmentId?: string;
  appointmentId?: string;
  professionalId?: string;
  module?: string;
  initialBodyModel?: 'female' | 'male';
  initialMapType?: 'BODY' | 'FACE';
  initialRegion?: string;
  readOnly?: boolean;
  onClose?: () => void;
  registerSave?: (save: () => Promise<boolean>) => void;
}

export const ZemdaBodyWorkspace: React.FC<ZemdaBodyWorkspaceProps> = ({
  onAssessmentSaved, patientId,
  initialAssessmentId,
  appointmentId,
  professionalId,
  module = 'general',
  initialBodyModel = 'female',
  initialMapType = 'BODY',
  initialRegion,
  readOnly = false,
  onClose, registerSave
}) => {
  const { showToast } = useToast();

  const { isNutritionist, isZemdaNutri } = useAuth();
  const isNutriUser=Boolean(isNutritionist || isZemdaNutri || module==='nutrition' || module==='nutri');
  const [activeSection,setActiveSection]=useState<'anthropometry'|'therapeutic'>(isNutriUser?'anthropometry':'therapeutic');
  const [tool,setTool]=useState<'select'|'pen'|'eraser'>('select');
  const [penColor,setPenColor]=useState('#dc2626'),[penWidth,setPenWidth]=useState(4);
  const [showClearDrawingsConfirm,setShowClearDrawingsConfirm]=useState(false);
  const [focusedRegion,setFocusedRegion]=useState(initialRegion || '');
  const [available,setAvailable]=useState<string[]>([]);
  const [history,setHistory]=useState<any[]|null>(null),[historyRecord,setHistoryRecord]=useState<any>(null);
  const state=useAnatomicalAssessment({onAssessmentSaved,patientId,initialAssessmentId,appointmentId,professionalId,module,initialBodyModel,initialMapType,readOnly,notify:showToast});
  const {layer,loading,loadError,savingStatus}=state;
  useEffect(()=>{registerSave?.(()=>state.save());});
  const {sexVariant:bodyModel,selectedRegions,drawings,clinicalNotes,mapType}=layer;
  const triggerAutoSave=(regions:string[],strokes=drawings,notes=clinicalNotes)=>state.update({selectedRegions:regions,drawings:strokes,clinicalNotes:notes});
  const handleToggleRegion=(regionId:string)=>{
    if(readOnly)return;
    setFocusedRegion(regionId);
    const selected=selectedRegions.some(id=>canonicalRegion(id)===regionId);
    state.update({selectedRegions:selected?selectedRegions.filter(id=>canonicalRegion(id)!==regionId):[...selectedRegions,regionId],selectionViews:{...layer.selectionViews,[regionId]:layer.view}});
  };
  const handleSaveDrawings=(strokes:BodyStroke[])=>state.update({drawings:strokes});
  const handleConfirmClearDrawings=()=>{state.update({drawings:[]});setShowClearDrawingsConfirm(false);};
  const handleClearAllRegions=()=>{if(!readOnly && confirm('Desmarcar todas as regiões desta base e vista?'))state.update({selectedRegions:[]});};
  const handleModelChange=(sex:'female'|'male')=>{setFocusedRegion('');state.navigate(mapType,sex,layer.view);};
  const handleManualSave=()=>state.save(true);
  const openHistory=async()=>{try{if(!await state.save())return;setHistory(await ApiClient.get<any[]>(`/v1/body-assessments/patient/${patientId}${module.startsWith('estetic:') ? `?module=${encodeURIComponent(module)}` : ''}`));}catch{showToast('Não foi possível carregar o histórico.','error');}};
  if(loadError)return <p role="alert" className="p-6 text-rose-700">Não foi possível carregar o mapa. Feche e reabra para tentar novamente; nenhum dado foi alterado.</p>;

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
    <div className="space-y-4" data-testid="zemda360-workspace">
      <div className="flex flex-wrap justify-between items-center gap-3 bg-white border border-slate-200 rounded-2xl p-4">
        <div><h2 className="font-bold text-lg text-slate-900">Zemda360</h2><p className="text-xs text-slate-500">Mapeamento Visual &amp; Anatômico</p></div>
        <div className="flex items-center gap-2" role="group" aria-label="Tipo de mapa">
          {(['BODY','FACE'] as const).map(type=><button key={type} type="button" aria-pressed={mapType===type} className={`rounded-xl px-4 py-2 text-sm font-bold ${mapType===type?'bg-teal-700 text-white':'bg-slate-100 text-slate-600'}`} onClick={()=>{setFocusedRegion('');state.navigate(type,bodyModel,type==='BODY'?'all':'front');}}>{type==='BODY'?'Corpo':'Face'}</button>)}
        </div>
        {!readOnly && <button type="button" onClick={openHistory} className="text-sm font-bold text-teal-700 px-3 py-2">Histórico</button>}
      </div>
      {mapType==='FACE' && <div role="group" aria-label="Vista facial" className="flex flex-wrap gap-2">{FACE_VIEWS.map(v=><button key={v.id} type="button" aria-pressed={layer.view===v.id} className={`px-3 py-2 rounded-xl text-xs font-bold ${layer.view===v.id?'bg-teal-700 text-white':'bg-white border border-slate-200 text-slate-600'}`} onClick={()=>{setFocusedRegion('');state.navigate('FACE',bodyModel,v.id);}}>{v.label}</button>)}</div>}
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
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_290px] gap-4">
      <div data-tour="body-canvas-container" className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex justify-center overflow-hidden">
        <AnatomicalMapCanvas
          onRegionsReady={setAvailable}
          key={state.document.activeLayerKey}
          mapType={mapType} view={layer.view} onViewChange={view=>state.navigate(mapType,bodyModel,view)}
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

      <AnatomicalRegionPanel key={state.document.activeLayerKey} layer={layer} regionId={focusedRegion} available={available} onFocus={setFocusedRegion} readOnly={readOnly}
        onAdd={mark=>state.update({marks:[...layer.marks,mark],selectedRegions:Array.from(new Set([...selectedRegions,mark.regionId]))})}
        onRemove={id=>state.update({marks:layer.marks.filter(m=>m.id!==id)})}/>
      </div>
      {/* 3. RESUMO DAS REGIÕES SELECIONADAS & OBSERVAÇÕES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Áreas Marcadas */}
        <div className="lg:col-span-2 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-rose-500" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Regiões selecionadas
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
              Nenhuma região marcada. No modo <strong>Selecionar</strong>, clique diretamente sobre o mapa para registrar as áreas afetadas.
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
      {mapType==='BODY' && <div className="space-y-4 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Registros complementares existentes:
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

      }
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
      {history && <div role="dialog" aria-label="Histórico Zemda360" className="fixed inset-0 z-[70] bg-slate-900/70 flex items-center justify-center p-4"><div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto p-5 space-y-4">
        <div className="flex justify-between items-center"><h3 className="font-bold">Histórico Zemda360</h3><button type="button" onClick={()=>{setHistory(null);setHistoryRecord(null);}}>Fechar histórico</button></div>
        {!history.length && <p>Nenhum registro anterior.</p>}
        <div className="flex flex-wrap gap-2">{history.map(a=><button key={a.id} type="button" className="border rounded-xl p-3 text-sm" onClick={async()=>{try{setHistoryRecord(await ApiClient.get(`/v1/body-assessments/${a.id}`));}catch{showToast('Erro ao abrir registro.','error');}}}>{a.assessment_date} · {a.professional_name || 'Profissional'} · Abrir registro</button>)}</div>
        {historyRecord && <AnatomicalRecordPreview key={historyRecord.assessment.id} response={historyRecord}/>}
      </div></div>}
    </div>
  );
};
