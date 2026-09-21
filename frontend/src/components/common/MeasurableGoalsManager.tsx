import React, { useState, useEffect } from 'react';
import {
  Target,
  Plus,
  CheckCircle2,
  Clock,
  Trash2,
  X,
  TrendingUp,
  History,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Award
} from 'lucide-react';
import { ApiClient } from '../../api/client';

export interface ClinicalGoalHistoryItem {
  date: string;
  value?: string;
  status: string;
  notes?: string;
  professionalName?: string;
}

export interface ClinicalGoalItem {
  id: string;
  tenant_id?: string;
  patient_id?: string;
  professional_id?: string;
  professional_name?: string;
  module_type: string;
  specialty?: string;
  domain: string;
  title: string;
  description?: string;
  baseline_value?: string;
  current_value?: string;
  target_value: string;
  unit?: string;
  deadline?: string;
  status: 'not_started' | 'in_progress' | 'partially_reached' | 'reached' | 'reformulated' | 'closed' | string;
  notes?: string;
  history?: ClinicalGoalHistoryItem[];
  history_json?: string;
  progress_percent?: number;
  created_at?: string;
  updated_at?: string;
}

export interface MeasurableGoalsManagerProps {
  patientId: string;
  specialty?: string;
  moduleType?: string;
  domain?: string;
  title?: string;
  readOnly?: boolean;
}

export const MeasurableGoalsManager: React.FC<MeasurableGoalsManagerProps> = ({
  patientId,
  specialty,
  moduleType,
  domain: initialDomain,
  title: sectionTitle,
  readOnly = false
}) => {
  const effectiveModule = moduleType || specialty || initialDomain || 'geral';

  const [goals, setGoals] = useState<ClinicalGoalItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [expandedHistoryGoalId, setExpandedHistoryGoalId] = useState<string | null>(null);

  // New Goal form state
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState('Funcional');
  const [description, setDescription] = useState('');
  const [baselineValue, setBaselineValue] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('%');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Progress modal state
  const [selectedGoalForProgress, setSelectedGoalForProgress] = useState<ClinicalGoalItem | null>(null);
  const [progressForm, setProgressForm] = useState({
    date: new Date().toISOString().split('T')[0],
    value: '',
    status: 'in_progress',
    notes: ''
  });
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);

  // Sanitiza entrada de texto para campos numéricos/percentuais (permite apenas dígitos, ponto, vírgula, hífen e %)
  const sanitizeNumericInput = (val: string) => {
    return val.replace(/[^0-9.,\-%\s]/g, '');
  };

  // Validação semântica e de intervalo para valores numéricos/percentuais
  const validateGoalNumeric = (val: string, fieldName: string, unitStr: string): string | null => {
    if (!val || !val.trim()) return null;
    let clean = val.trim();
    const isPercent = (unitStr && unitStr.includes('%')) || clean.endsWith('%');
    if (clean.endsWith('%')) {
      clean = clean.slice(0, -1).trim();
    }
    const num = Number(clean.replace(',', '.'));
    if (isNaN(num)) {
      return `O campo "${fieldName}" deve conter um valor numérico válido (ex: 80 ou 80%). Textos livres não são permitidos.`;
    }
    if (isPercent && (num < 0 || num > 100)) {
      return `Para metas com unidade percentual (%), o campo "${fieldName}" deve estar no intervalo de 0% a 100%.`;
    }
    return null;
  };

  const loadGoals = async () => {
    if (!patientId) return;
    try {
      setIsLoading(true);
      const res = await ApiClient.get<any[]>(`/v1/clinical/goals/${patientId}`);
      if (Array.isArray(res)) {
        // Filtra por módulo/especialidade se especificado (permitindo geral ver todos)
        const filtered = res.filter(g => {
          if (!g.module_type && !g.specialty) return true;
          if (effectiveModule === 'geral' || effectiveModule === 'general') return true;
          return (g.module_type === effectiveModule || g.specialty === effectiveModule);
        });
        setGoals(filtered);
      }
    } catch (err) {
      console.error('[MeasurableGoalsManager] Erro ao carregar metas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGoals();
  }, [patientId, effectiveModule]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim() || !patientId || !targetValue.trim()) {
      setFormError('Preencha os campos obrigatórios (*).');
      return;
    }

    const targetErr = validateGoalNumeric(targetValue, 'Alvo (Meta)', unit);
    if (targetErr) {
      setFormError(targetErr);
      return;
    }

    if (baselineValue.trim()) {
      const baseErr = validateGoalNumeric(baselineValue, 'Valor Basal', unit);
      if (baseErr) {
        setFormError(baseErr);
        return;
      }
    }

    if (currentValue.trim()) {
      const currErr = validateGoalNumeric(currentValue, 'Valor Atual', unit);
      if (currErr) {
        setFormError(currErr);
        return;
      }
    }

    try {
      const payload = {
        patientId,
        moduleType: effectiveModule,
        domain: domain.trim() || 'Geral',
        title: title.trim(),
        description: description.trim() || null,
        baselineValue: baselineValue.trim() || '0',
        currentValue: currentValue.trim() || baselineValue.trim() || '0',
        targetValue: targetValue.trim(),
        unit: unit.trim() || null,
        deadline: deadline || null,
        notes: notes.trim() || null
      };

      await ApiClient.post('/v1/clinical/goals', payload);
      setTitle('');
      setDescription('');
      setBaselineValue('');
      setCurrentValue('');
      setTargetValue('');
      setNotes('');
      setDeadline('');
      setFormError(null);
      setIsAdding(false);
      await loadGoals();
    } catch (err: any) {
      console.error('[MeasurableGoalsManager] Erro ao criar meta:', err);
      setFormError(err?.message || 'Erro ao cadastrar meta terapêutica.');
    }
  };

  const handleOpenProgressModal = (goal: ClinicalGoalItem) => {
    setSelectedGoalForProgress(goal);
    setProgressError(null);
    setProgressForm({
      date: new Date().toISOString().split('T')[0],
      value: goal.current_value || '',
      status: goal.status || 'in_progress',
      notes: ''
    });
  };

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    setProgressError(null);
    if (!selectedGoalForProgress) return;

    if (!progressForm.value.trim()) {
      setProgressError('Informe o novo valor alcançado.');
      return;
    }

    const valErr = validateGoalNumeric(progressForm.value, 'Novo Valor', selectedGoalForProgress.unit || '');
    if (valErr) {
      setProgressError(valErr);
      return;
    }

    try {
      setIsSavingProgress(true);
      await ApiClient.put(`/v1/clinical/goals/${selectedGoalForProgress.id}/progress`, {
        currentValue: progressForm.value.trim(),
        status: progressForm.status,
        notes: progressForm.notes,
        date: progressForm.date
      });
      setSelectedGoalForProgress(null);
      setProgressError(null);
      await loadGoals();
    } catch (err: any) {
      console.error('[MeasurableGoalsManager] Erro ao registrar progresso:', err);
      setProgressError(err?.message || 'Erro ao registrar progresso da meta.');
    } finally {
      setIsSavingProgress(false);
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (!confirm('Deseja excluir esta meta terapêutica?')) return;
    try {
      await ApiClient.delete(`/v1/clinical/goals/${id}`);
      setGoals(goals.filter(g => g.id !== id));
    } catch (err) {
      console.error('[MeasurableGoalsManager] Erro ao excluir meta:', err);
    }
  };

  const calculatePercent = (goal: ClinicalGoalItem): number => {
    if (goal.progress_percent !== undefined && goal.progress_percent !== null) {
      return Math.min(100, Math.max(0, Number(goal.progress_percent)));
    }
    const currentNum = parseFloat(goal.current_value || '');
    const targetNum = parseFloat(goal.target_value || '');
    const baselineNum = parseFloat(goal.baseline_value || '0');

    if (!isNaN(currentNum) && !isNaN(targetNum) && targetNum > baselineNum) {
      const pct = ((currentNum - baselineNum) / (targetNum - baselineNum)) * 100;
      return Math.min(100, Math.max(0, Math.round(pct)));
    }

    if (goal.status === 'reached' || goal.status === 'achieved') return 100;
    if (goal.status === 'partially_reached') return 50;
    if (goal.status === 'in_progress') return 25;
    return 0;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'reached':
      case 'achieved':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Alcançada
          </span>
        );
      case 'partially_reached':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 flex items-center gap-1 border border-blue-200">
            <TrendingUp className="w-3 h-3 text-blue-600" /> Parcialmente alcançada
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 flex items-center gap-1 border border-teal-200">
            <Clock className="w-3 h-3 text-teal-600" /> Em andamento
          </span>
        );
      case 'reformulated':
      case 'paused':
      case 'adjusted':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            Pausada / Reformulada
          </span>
        );
      case 'closed':
      case 'abandoned':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            Encerrada
          </span>
        );
      case 'not_started':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
            Não iniciada
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-teal-600" />
            {sectionTitle || 'Metas Terapêuticas Mensuráveis'}
          </h3>
          <p className="text-xs text-slate-500">
            Acompanhamento longitudinal de objetivos clínicos, metas funcionais e linha do tempo de evolução
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {isAdding ? 'Cancelar' : '+ Nova Meta'}
          </button>
        )}
      </div>

      {/* New Goal Form */}
      {isAdding && (
        <form onSubmit={handleCreateGoal} className="p-4 bg-teal-50/50 border border-teal-100 rounded-2xl space-y-3">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Descrição da Meta Objetiva / Habilidade *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Amplitude de flexão do joelho direito até 110 graus"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Domínio / Categoria
              </label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="Ex: Motor, Nutricional, Linguagem, AVD"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Valor Basal (Inicial)
              </label>
              <input
                type="text"
                value={baselineValue}
                onChange={(e) => setBaselineValue(sanitizeNumericInput(e.target.value))}
                placeholder="Ex: 60"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Valor Atual
              </label>
              <input
                type="text"
                value={currentValue}
                onChange={(e) => setCurrentValue(sanitizeNumericInput(e.target.value))}
                placeholder="Ex: 75"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alvo (Meta) *
              </label>
              <input
                type="text"
                required
                value={targetValue}
                onChange={(e) => setTargetValue(sanitizeNumericInput(e.target.value))}
                placeholder="Ex: 110 ou 100%"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unidade de Medida
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Ex: graus, %, kg, repetições"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prazo / Previsão
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Critérios de Avaliação e Observações
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Medição por goniometria ativa sem dor aguda"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setFormError(null);
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Salvar Meta
            </button>
          </div>
        </form>
      )}

      {/* Goals List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-6 text-xs text-slate-400">Carregando metas terapêuticas...</div>
        ) : goals.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
            Nenhuma meta clínica cadastrada para este paciente. Clique em "+ Nova Meta" para iniciar o planejamento terapêutico.
          </div>
        ) : (
          goals.map(goal => {
            const pct = calculatePercent(goal);
            const historyList: ClinicalGoalHistoryItem[] = goal.history || (() => {
              try { return JSON.parse(goal.history_json || '[]'); } catch { return []; }
            })();
            const isHistoryOpen = expandedHistoryGoalId === goal.id;

            return (
              <div
                key={goal.id}
                className="p-4 bg-white border border-slate-200/80 rounded-2xl space-y-3 hover:border-slate-300 transition-colors shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">
                        {goal.title}
                      </span>
                      {goal.domain && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {goal.domain}
                        </span>
                      )}
                      {getStatusBadge(goal.status)}
                    </div>
                    {goal.description && (
                      <p className="text-xs text-slate-600">
                        {goal.description}
                      </p>
                    )}
                    {goal.notes && (
                      <p className="text-[11px] text-slate-500 italic">
                        {goal.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleOpenProgressModal(goal)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                      >
                        <TrendingUp className="w-3.5 h-3.5 text-teal-600" />
                        Registrar Progresso
                      </button>
                    )}

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleDeleteGoal(goal.id)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="Remover meta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar & Indicators */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                    <span>
                      Progresso: <strong className="text-slate-900">{pct}%</strong>
                    </span>
                    <div className="flex items-center gap-3 text-[11px]">
                      {goal.baseline_value && (
                        <span className="text-slate-500">
                          Inicial: <strong>{goal.baseline_value} {goal.unit || ''}</strong>
                        </span>
                      )}
                      {goal.current_value && (
                        <span className="text-teal-700 font-bold">
                          Atual: <strong>{goal.current_value} {goal.unit || ''}</strong>
                        </span>
                      )}
                      {goal.target_value && (
                        <span className="text-emerald-700 font-bold">
                          Alvo: <strong>{goal.target_value} {goal.unit || ''}</strong>
                        </span>
                      )}
                      {goal.deadline && (
                        <span className="text-slate-500">
                          Prazo: {new Date(goal.deadline).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        pct >= 100
                          ? 'bg-emerald-500'
                          : pct >= 50
                          ? 'bg-teal-500'
                          : pct >= 25
                          ? 'bg-blue-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Histórico / Timeline Toggle */}
                {historyList.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setExpandedHistoryGoalId(isHistoryOpen ? null : goal.id)}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium transition cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-slate-400" />
                      <span>Histórico de Evolução ({historyList.length} registro{historyList.length !== 1 ? 's' : ''})</span>
                      {isHistoryOpen ? <ChevronUp className="w-3.5 h-3.5 ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 ml-0.5" />}
                    </button>

                    {isHistoryOpen && (
                      <div className="mt-2.5 pl-4 border-l-2 border-teal-200 space-y-2 py-1">
                        {historyList.map((h, idx) => (
                          <div key={idx} className="text-xs space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-800">
                                {new Date(h.date).toLocaleDateString('pt-BR')}
                              </span>
                              {h.value && (
                                <span className="text-teal-700 font-medium bg-teal-50 px-2 py-0.5 rounded text-[11px]">
                                  Valor: {h.value} {goal.unit || ''}
                                </span>
                              )}
                              {h.status && getStatusBadge(h.status)}
                              {h.professionalName && (
                                <span className="text-slate-400 text-[10px]">
                                  por {h.professionalName}
                                </span>
                              )}
                            </div>
                            {h.notes && (
                              <p className="text-slate-600 text-[11px] leading-relaxed">
                                {h.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal Registrar Progresso */}
      {selectedGoalForProgress && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-teal-50/50">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-slate-800 text-base">Registrar Progresso da Meta</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGoalForProgress(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProgress} className="p-5 space-y-4">
              {progressError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{progressError}</span>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Meta:</p>
                <p className="text-xs font-bold text-slate-900">{selectedGoalForProgress.title}</p>
                <p className="text-[11px] text-slate-500">
                  Alvo: {selectedGoalForProgress.target_value} {selectedGoalForProgress.unit || ''}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Data do Registro *
                  </label>
                  <input
                    type="date"
                    required
                    value={progressForm.date}
                    onChange={(e) => setProgressForm({ ...progressForm, date: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Novo Valor ({selectedGoalForProgress.unit || 'Medida'}) *
                  </label>
                  <input
                    type="text"
                    required
                    value={progressForm.value}
                    onChange={(e) => setProgressForm({ ...progressForm, value: sanitizeNumericInput(e.target.value) })}
                    placeholder={`Ex: 90 ${selectedGoalForProgress.unit || ''}`}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status da Meta *
                </label>
                <select
                  value={progressForm.status}
                  onChange={(e) => setProgressForm({ ...progressForm, status: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none bg-white"
                >
                  <option value="not_started">Não iniciada</option>
                  <option value="in_progress">Em andamento</option>
                  <option value="partially_reached">Parcialmente alcançada</option>
                  <option value="reached">Alcançada</option>
                  <option value="reformulated">Pausada / Reformulada</option>
                  <option value="closed">Encerrada</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observações e Evolução Clínica
                </label>
                <textarea
                  rows={3}
                  value={progressForm.notes}
                  onChange={(e) => setProgressForm({ ...progressForm, notes: e.target.value })}
                  placeholder="Descreva a evolução do paciente, intervenções aplicadas ou ajustes de conduta..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGoalForProgress(null);
                    setProgressError(null);
                  }}
                  className="px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingProgress}
                  className="px-4 py-2 text-xs bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSavingProgress ? 'Salvando...' : 'Salvar Progresso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
