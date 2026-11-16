import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Edit2,
  Eye,
  Layers,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Sparkles
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PersonalTemplateBuilder } from './PersonalTemplateBuilder';
import { PersonalVideoPlayerModal } from './PersonalVideoPlayerModal';

interface StudioClassExercisePlanPanelProps {
  occurrenceKey: string | null;
  initialExercisePlan?: any;
  initialServiceLinkedTemplates?: any[];
  initialAvailableTemplates?: any[];
  canEdit?: boolean;
  onPlanUpdated?: (bundle: any) => void;
}

export const StudioClassExercisePlanPanel: React.FC<StudioClassExercisePlanPanelProps> = ({
  occurrenceKey,
  initialExercisePlan,
  initialServiceLinkedTemplates,
  initialAvailableTemplates,
  canEdit = true,
  onPlanUpdated
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<any>(initialExercisePlan || null);
  const [serviceTemplates, setServiceTemplates] = useState<any[]>(initialServiceLinkedTemplates || []);
  const [availableTemplates, setAvailableTemplates] = useState<any[]>(initialAvailableTemplates || []);
  const [activeDivisionIdx, setActiveDivisionIdx] = useState(0);
  const [executionMode, setExecutionMode] = useState(false);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [expandedExKey, setExpandedExKey] = useState<string | null>(null);
  const [videoModal, setVideoModal] = useState<{ url: string; name: string } | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  useEffect(() => {
    if (initialExercisePlan !== undefined) {
      setPlan(initialExercisePlan || null);
      const exec = initialExercisePlan?.executionState;
      if (exec) {
        setActiveDivisionIdx(Number(exec.activeDivisionIndex) || 0);
        setCurrentExIdx(Number(exec.currentExerciseIndex) || 0);
        setCompletedMap(exec.completedExercises || {});
        if (exec.status === 'in_progress') setExecutionMode(true);
      } else {
        setActiveDivisionIdx(0);
        setCurrentExIdx(0);
        setCompletedMap({});
      }
    }
    if (initialServiceLinkedTemplates !== undefined) {
      setServiceTemplates(initialServiceLinkedTemplates || []);
    }
    if (initialAvailableTemplates !== undefined) {
      setAvailableTemplates(initialAvailableTemplates || []);
    }
  }, [initialExercisePlan, initialServiceLinkedTemplates, initialAvailableTemplates]);

  const fetchPlan = async () => {
    if (!occurrenceKey) return;
    try {
      setLoading(true);
      const res = await ApiClient.get<any>(`/v1/classes/occurrences/${encodeURIComponent(occurrenceKey)}/exercise-plan`);
      setPlan(res?.exercisePlan || null);
      setServiceTemplates(res?.serviceLinkedTemplates || []);
      setAvailableTemplates(res?.availableTemplates || []);
      const exec = res?.exercisePlan?.executionState;
      if (exec) {
        setActiveDivisionIdx(Number(exec.activeDivisionIndex) || 0);
        setCurrentExIdx(Number(exec.currentExerciseIndex) || 0);
        setCompletedMap(exec.completedExercises || {});
      }
      onPlanUpdated?.(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (occurrenceKey && initialExercisePlan === undefined) {
      fetchPlan();
    }
  }, [occurrenceKey]);

  if (!occurrenceKey) return null;

  const workouts = Array.isArray(plan?.workouts) ? plan.workouts : [];
  const currentDivision = workouts[activeDivisionIdx] || workouts[0] || null;
  const exercises = Array.isArray(currentDivision?.exercises) ? currentDivision.exercises : [];
  const currentStepExercise = exercises[currentExIdx] || exercises[0] || null;

  const persistExecutionState = async (nextState: {
    activeDivisionIndex: number;
    currentExerciseIndex: number;
    completedExercises: Record<string, boolean>;
    status: 'idle' | 'in_progress' | 'completed';
  }) => {
    if (!occurrenceKey || !canEdit) return;
    try {
      const res = await ApiClient.put<any>(`/v1/classes/occurrences/${encodeURIComponent(occurrenceKey)}/exercise-plan`, {
        executionState: nextState
      });
      if (res?.exercisePlan) {
        setPlan(res.exercisePlan);
        onPlanUpdated?.(res);
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao salvar progresso da aula.', 'error');
    }
  };

  const handleSwitchTemplateForClass = async (newTemplateId: string) => {
    if (!occurrenceKey || !canEdit) return;
    try {
      setSaving(true);
      const res = await ApiClient.put<any>(`/v1/classes/occurrences/${encodeURIComponent(occurrenceKey)}/exercise-plan`, {
        templateId: newTemplateId || null,
        executionState: {
          activeDivisionIndex: 0,
          currentExerciseIndex: 0,
          completedExercises: {},
          status: 'idle'
        }
      });
      setPlan(res?.exercisePlan || null);
      setServiceTemplates(res?.serviceLinkedTemplates || []);
      setAvailableTemplates(res?.availableTemplates || []);
      setActiveDivisionIdx(0);
      setCurrentExIdx(0);
      setCompletedMap({});
      onPlanUpdated?.(res);
      showToast('Template aplicado apenas para esta aula (o modelo original da biblioteca foi preservado).', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao trocar template da aula.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleExerciseDone = (exKey: string) => {
    const nextMap = { ...completedMap, [exKey]: !completedMap[exKey] };
    setCompletedMap(nextMap);
    persistExecutionState({
      activeDivisionIndex: activeDivisionIdx,
      currentExerciseIndex: currentExIdx,
      completedExercises: nextMap,
      status: executionMode ? 'in_progress' : 'idle'
    });
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 p-4 space-y-3.5 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-emerald-100 pb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
              <Dumbbell className="w-4 h-4 text-emerald-600" />
              Plano de exercícios da aula
            </span>
            {plan ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {plan.isCustomOverride ? 'Template desta aula' : 'Template padrão do serviço'}
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Sem template vinculado
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {plan
              ? `${plan.templateTitle} (${plan.structureType}) — alterações aqui afetam apenas esta aula e não modificam o template original da biblioteca.`
              : 'Selecione um template existente da biblioteca ou crie um novo planejamento para guiar esta aula.'}
          </p>
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              disabled={saving || loading}
              value={plan?.templateId || ''}
              onChange={e => handleSwitchTemplateForClass(e.target.value)}
              aria-label="Trocar template da aula"
              className="border border-emerald-200 rounded-xl px-2.5 py-1.5 text-xs bg-white font-semibold text-slate-800 max-w-[230px]"
            >
              <option value="">Trocar template para esta aula...</option>
              {serviceTemplates.length > 0 && (
                <optgroup label="Templates vinculados ao serviço">
                  {serviceTemplates.map((t: any) => (
                    <option key={`srv-${t.id}`} value={t.id}>
                      ★ {t.title} ({t.exercises_count || 0} exerc.)
                    </option>
                  ))}
                </optgroup>
              )}
              {availableTemplates.length > 0 && (
                <optgroup label="Todos os templates da biblioteca">
                  {availableTemplates.map((t: any) => (
                    <option key={`all-${t.id}`} value={t.id}>
                      {t.title} ({t.structure_type} • {t.exercises_count || 0} exerc.)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <button
              type="button"
              onClick={() => setBuilderOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50 text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Novo Template</span>
            </button>

            {plan && exercises.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const nextMode = !executionMode;
                  setExecutionMode(nextMode);
                  persistExecutionState({
                    activeDivisionIndex: activeDivisionIdx,
                    currentExerciseIndex: currentExIdx,
                    completedExercises: completedMap,
                    status: nextMode ? 'in_progress' : 'idle'
                  });
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  executionMode
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{executionMode ? 'Sair do Modo Execução' : 'Iniciar Execução do Plano'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-slate-400">Carregando plano de exercícios da aula...</div>
      ) : !plan || workouts.length === 0 ? (
        <div className="p-4 rounded-xl bg-white border border-dashed border-slate-200 text-center space-y-2">
          <p className="text-xs text-slate-600">
            Nenhum plano de exercícios ativo para esta aula. Escolha um template no seletor acima ou crie um novo modelo na biblioteca.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Abas de divisão (A / B / C) quando houver mais de 1 bloco */}
          {workouts.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {workouts.map((div: any, idx: number) => {
                const active = idx === activeDivisionIdx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActiveDivisionIdx(idx);
                      setCurrentExIdx(0);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    {div.division ? `Divisão ${div.division}` : div.title} ({div.exercises?.length || 0})
                  </button>
                );
              })}
            </div>
          )}

          {currentDivision?.notes && (
            <div className="text-xs text-slate-700 bg-white/90 border border-slate-200 rounded-xl px-3 py-2">
              <strong className="text-emerald-800">Orientação do bloco: </strong>
              <span>{currentDivision.notes}</span>
            </div>
          )}

          {/* Modo Execução Guiada na Sessão (Passo a Passo) */}
          {executionMode && currentStepExercise && (
            <div className="p-3.5 rounded-2xl bg-white border-2 border-emerald-500 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                  Em execução • Exercício {currentExIdx + 1} de {exercises.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentExIdx <= 0}
                    onClick={() => {
                      const prev = Math.max(0, currentExIdx - 1);
                      setCurrentExIdx(prev);
                      persistExecutionState({
                        activeDivisionIndex: activeDivisionIdx,
                        currentExerciseIndex: prev,
                        completedExercises: completedMap,
                        status: 'in_progress'
                      });
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={currentExIdx >= exercises.length - 1}
                    onClick={() => {
                      const next = Math.min(exercises.length - 1, currentExIdx + 1);
                      setCurrentExIdx(next);
                      persistExecutionState({
                        activeDivisionIndex: activeDivisionIdx,
                        currentExerciseIndex: next,
                        completedExercises: completedMap,
                        status: 'in_progress'
                      });
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-start">
                {(currentStepExercise.gif_url || currentStepExercise.photo_url || currentStepExercise.fallback_url) && (
                  <img
                    src={currentStepExercise.gif_url || currentStepExercise.photo_url || currentStepExercise.fallback_url}
                    alt={currentStepExercise.name}
                    className="w-24 h-24 rounded-xl object-cover border border-slate-200 bg-slate-50 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h5 className="font-extrabold text-sm text-slate-900">{currentStepExercise.name}</h5>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {currentStepExercise.muscle_group}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                    <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg">
                      {currentStepExercise.sets} séries × {currentStepExercise.reps} reps
                    </span>
                    {currentStepExercise.load_kg !== null && currentStepExercise.load_kg !== undefined && (
                      <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-lg">
                        Carga: {currentStepExercise.load_kg} kg
                      </span>
                    )}
                    {currentStepExercise.rest_seconds ? (
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg">
                        Descanso: {currentStepExercise.rest_seconds}s
                      </span>
                    ) : null}
                    {currentStepExercise.technique && currentStepExercise.technique !== 'Direta' && (
                      <span className="bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-lg">
                        Técnica: {currentStepExercise.technique}
                      </span>
                    )}
                  </div>
                  {currentStepExercise.instructions && (
                    <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <strong>Orientação técnica:</strong> {currentStepExercise.instructions}
                    </p>
                  )}
                  {currentStepExercise.notes && (
                    <p className="text-[11px] text-emerald-800 italic">
                      Observação: {currentStepExercise.notes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Lista ordenada de exercícios da aula */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {exercises.map((ex: any, idx: number) => {
              const exKey = `${activeDivisionIdx}-${idx}`;
              const isDone = Boolean(completedMap[exKey]);
              const isCurrentStep = executionMode && idx === currentExIdx;
              const isExpanded = expandedExKey === exKey;
              const mediaSrc = ex.gif_url || ex.photo_url || ex.fallback_url || null;

              return (
                <div
                  key={exKey}
                  className={`p-2.5 rounded-xl border text-xs transition-all ${
                    isCurrentStep
                      ? 'bg-emerald-50/80 border-emerald-500 ring-1 ring-emerald-400'
                      : isDone
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleExerciseDone(exKey)}
                      title={isDone ? 'Marcar como pendente' : 'Marcar exercício como realizado na aula'}
                      className={`w-6 h-6 rounded-lg font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5 cursor-pointer transition-colors ${
                        isDone
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-emerald-100 hover:text-emerald-800'
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                    </button>

                    {mediaSrc && (
                      <img
                        src={mediaSrc}
                        alt={ex.name}
                        onClick={() => setExpandedExKey(isExpanded ? null : exKey)}
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 bg-slate-50 shrink-0 cursor-pointer"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`font-bold truncate ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                          {ex.name}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">
                          {ex.muscle_group}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                          {ex.sets} × {ex.reps}
                        </span>
                        {ex.load_kg !== null && ex.load_kg !== undefined && (
                          <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                            {ex.load_kg} kg
                          </span>
                        )}
                        {ex.rest_seconds ? (
                          <span className="text-slate-500">• {ex.rest_seconds}s</span>
                        ) : null}
                        {ex.technique && ex.technique !== 'Direta' && (
                          <span className="text-emerald-700 font-semibold">• {ex.technique}</span>
                        )}
                      </div>

                      {ex.notes && (
                        <p className="text-[11px] text-slate-500 italic mt-1 truncate" title={ex.notes}>
                          Obs: {ex.notes}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-1.5">
                        {ex.instructions && (
                          <button
                            type="button"
                            onClick={() => setExpandedExKey(isExpanded ? null : exKey)}
                            className="text-[10px] font-semibold text-indigo-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{isExpanded ? 'Ocultar orientações' : 'Ver orientações e mídia'}</span>
                          </button>
                        )}
                        {ex.video_url && (
                          <button
                            type="button"
                            onClick={() => setVideoModal({ url: ex.video_url, name: ex.name })}
                            className="text-[10px] font-semibold text-emerald-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Vídeo</span>
                          </button>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="mt-2 p-2 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5 text-[11px] text-slate-700">
                          {mediaSrc && (
                            <img
                              src={mediaSrc}
                              alt={ex.name}
                              className="w-full max-h-44 object-contain rounded-lg bg-white border border-slate-200"
                            />
                          )}
                          {ex.equipment && (
                            <p>
                              <strong>Equipamento:</strong> {ex.equipment}
                            </p>
                          )}
                          {ex.instructions && (
                            <p className="leading-relaxed">
                              <strong>Execução:</strong> {ex.instructions}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {builderOpen && (
        <PersonalTemplateBuilder
          isOpen={builderOpen}
          onClose={() => setBuilderOpen(false)}
          onSaved={async () => {
            setBuilderOpen(false);
            const prevIds = new Set(availableTemplates.map((t: any) => t.id));
            const res = await ApiClient.get<{ templates: any[] }>('/v1/personal/templates').catch(() => ({ templates: [] }));
            const nextList = Array.isArray(res?.templates) ? res.templates : [];
            const newlyCreated = nextList.find((t: any) => !prevIds.has(t.id));
            if (newlyCreated) {
              await handleSwitchTemplateForClass(newlyCreated.id);
            } else {
              await fetchPlan();
            }
          }}
        />
      )}

      <PersonalVideoPlayerModal
        isOpen={Boolean(videoModal)}
        onClose={() => setVideoModal(null)}
        videoUrl={videoModal?.url}
        exerciseName={videoModal?.name || 'Exercício'}
      />
    </div>
  );
};
