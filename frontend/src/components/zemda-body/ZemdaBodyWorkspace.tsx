import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { ZemdaBodyCanvas } from './ZemdaBodyCanvas';
import { getRegionLabel } from './bodyRegionsData';
import {
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  Sparkles,
  Layers,
  FileText,
  User,
  ShieldCheck,
  Tag
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

  // Estados principais
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [bodyModel, setBodyModel] = useState<'female' | 'male'>(initialBodyModel);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [clinicalNotes, setClinicalNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Timer de debounce para persistência automática
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega avaliação existente ou cria se em consulta
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

          // Restaura regiões selecionadas e observações de notes ou markers
          let loadedRegions: string[] = [];
          if (res.assessment.notes) {
            try {
              const parsed = JSON.parse(res.assessment.notes);
              if (Array.isArray(parsed)) {
                loadedRegions = parsed;
              } else if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.selectedRegions)) {
                  loadedRegions = parsed.selectedRegions;
                }
                if (parsed.clinicalNotes) {
                  setClinicalNotes(parsed.clinicalNotes);
                }
              } else {
                setClinicalNotes(res.assessment.notes);
              }
            } catch {
              // Se notes era texto puro
              setClinicalNotes(res.assessment.notes);
            }
          }

          // Se não havia no notes, extrai dos markers
          if (loadedRegions.length === 0 && Array.isArray(res.markers) && res.markers.length > 0) {
            loadedRegions = res.markers
              .filter((m: any) => m.body_region)
              .map((m: any) => m.body_region);
          }

          setSelectedRegions(loadedRegions);
        } else if (!readOnly) {
          // Cria nova avaliação para o agendamento
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

  // Função central de persistência
  const saveAssessmentData = useCallback(
    async (
      regionsToSave: string[],
      notesToSave: string,
      modelToSave: 'female' | 'male',
      isManual: boolean = false
    ) => {
      if (readOnly) return;

      try {
        setSavingStatus('saving');

        const notesPayload = JSON.stringify({
          selectedRegions: regionsToSave,
          clinicalNotes: notesToSave
        });

        const res = await ApiClient.post<any>('/v1/body-assessments', {
          id: assessmentId || undefined,
          patientId,
          appointmentId: appointmentId || null,
          professionalId: professionalId || null,
          module,
          bodyModel: modelToSave,
          notes: notesPayload,
          assessmentDate: new Date().toISOString().split('T')[0]
        });

        const activeId = assessmentId || res?.assessmentId;
        if (!assessmentId && res?.assessmentId) {
          setAssessmentId(res.assessmentId);
        }

        // Sincroniza marcadores individuais em body_markers para compatibilidade com relatórios
        if (activeId) {
          // Salva cada marcador ativo
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

            await ApiClient.post(`/v1/body-assessments/${activeId}/markers`, {
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
          showToast('Avaliação corporal salva com sucesso!', 'success');
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
    [assessmentId, patientId, appointmentId, professionalId, module, readOnly, showToast]
  );

  // Debounce para salvamento automático ao clicar no mapa
  const triggerAutoSave = (
    newRegions: string[],
    newNotes: string = clinicalNotes,
    newModel: 'female' | 'male' = bodyModel
  ) => {
    if (readOnly) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      saveAssessmentData(newRegions, newNotes, newModel, false);
    }, 600);
  };

  // Alternar região corporal (clicar para marcar / desmarcar)
  const handleToggleRegion = (regionId: string) => {
    if (readOnly) return;

    let updated: string[];
    if (selectedRegions.includes(regionId)) {
      updated = selectedRegions.filter(id => id !== regionId);
      // Remove marcador individual
      if (assessmentId) {
        ApiClient.delete(`/v1/body-assessments/markers/${assessmentId}_${regionId}`).catch(() => {});
      }
    } else {
      updated = [...selectedRegions, regionId];
    }

    setSelectedRegions(updated);
    triggerAutoSave(updated);
  };

  // Desmarcar todas as regiões
  const handleClearAll = () => {
    if (readOnly || selectedRegions.length === 0) return;
    if (confirm('Deseja desmarcar todas as regiões selecionadas?')) {
      setSelectedRegions([]);
      triggerAutoSave([]);
      showToast('Seleções limpas', 'info');
    }
  };

  // Alternar modelo (Feminino / Masculino)
  const handleModelChange = (newModel: 'female' | 'male') => {
    setBodyModel(newModel);
    triggerAutoSave(selectedRegions, clinicalNotes, newModel);
  };

  // Salvar manualmente pelo botão
  const handleManualSave = () => {
    saveAssessmentData(selectedRegions, clinicalNotes, bodyModel, true);
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
      {/* 1. BARRA SUPERIOR: CONTROLES & STATUS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Lado Esquerdo: Modelo Corporal */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-400" />
            Modelo:
          </span>

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

          <span className="text-xs text-slate-400 hidden sm:inline">• Panorama 4 Vistas</span>
        </div>

        {/* Lado Direito: Status e Ações */}
        <div className="flex items-center gap-3">
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
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Avaliação</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. MAPA CORPORAL PANORÂMICO INTERATIVO */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex justify-center overflow-hidden">
        <ZemdaBodyCanvas
          bodyModel={bodyModel}
          selectedRegions={selectedRegions}
          onToggleRegion={handleToggleRegion}
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
                onClick={handleClearAll}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
              >
                Desmarcar todas
              </button>
            )}
          </div>

          {selectedRegions.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">
              Nenhuma região marcada. Clique diretamente sobre o mapa acima para registrar as áreas corporais afetadas.
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
              triggerAutoSave(selectedRegions, e.target.value);
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
    </div>
  );
};
