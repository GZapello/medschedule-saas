import React, { useState, useEffect } from 'react';
import { Target, Plus, CheckCircle2, AlertCircle, Clock, Check, Trash2, Edit3, Save, X, ArrowUpRight } from 'lucide-react';
import { ApiClient } from '../../api/client';

export interface ClinicalGoalItem {
  id: string;
  patient_id?: string;
  specialty?: string;
  title: string;
  category?: string;
  target_date?: string;
  status: 'not_started' | 'in_progress' | 'achieved' | 'abandoned' | 'adjusted';
  progress_percent: number;
  baseline_value?: string;
  target_value?: string;
  current_value?: string;
  milestone_notes?: string;
  created_at?: string;
}

export interface MeasurableGoalsManagerProps {
  patientId: string;
  specialty: 'to' | 'fono' | 'odonto' | 'geral';
  readOnly?: boolean;
}

export const MeasurableGoalsManager: React.FC<MeasurableGoalsManagerProps> = ({
  patientId,
  specialty,
  readOnly = false
}) => {
  const [goals, setGoals] = useState<ClinicalGoalItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Funcional');
  const [targetDate, setTargetDate] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [milestoneNotes, setMilestoneNotes] = useState('');

  const loadGoals = async () => {
    if (!patientId) return;
    try {
      setIsLoading(true);
      const res = await ApiClient.get(`/v1/clinical/goals/${patientId}`);
      if (Array.isArray(res)) {
        const filtered = res.filter((g: any) => !g.specialty || g.specialty === specialty);
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
  }, [patientId, specialty]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !patientId) return;

    try {
      const payload = {
        patientId,
        specialty,
        title: title.trim(),
        category: category.trim(),
        targetDate: targetDate || null,
        targetValue: targetValue.trim() || null,
        progressPercent: Number(progressPercent) || 0,
        milestoneNotes: milestoneNotes.trim() || null
      };
      await ApiClient.post('/v1/clinical/goals', payload);
      setTitle('');
      setTargetValue('');
      setProgressPercent(0);
      setMilestoneNotes('');
      setIsAdding(false);
      await loadGoals();
    } catch (err) {
      console.error('[MeasurableGoalsManager] Erro ao criar meta:', err);
      alert('Erro ao cadastrar meta terapêutica.');
    }
  };

  const handleUpdateProgress = async (goal: ClinicalGoalItem, newPercent: number, newStatus?: string) => {
    try {
      const computedStatus = newStatus || (newPercent >= 100 ? 'achieved' : newPercent > 0 ? 'in_progress' : 'not_started');
      await ApiClient.put(`/v1/clinical/goals/${goal.id}/progress`, {
        progressPercent: newPercent,
        status: computedStatus,
        milestoneNotes: goal.milestone_notes
      });
      setGoals(goals.map(g => g.id === goal.id ? { ...g, progress_percent: newPercent, status: computedStatus as any } : g));
    } catch (err) {
      console.error('[MeasurableGoalsManager] Erro ao atualizar progresso:', err);
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

  const getStatusBadge = (status: ClinicalGoalItem['status']) => {
    switch (status) {
      case 'achieved':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Atingida
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 flex items-center gap-1">
            <Clock className="w-3 h-3 text-teal-600" /> Em Progresso
          </span>
        );
      case 'adjusted':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
            Ajustada
          </span>
        );
      case 'abandoned':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            Descontinuada
          </span>
        );
      case 'not_started':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            Não Iniciada
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
            Metas Terapêuticas Mensuráveis
          </h3>
          <p className="text-xs text-slate-500">
            Acompanhamento longitudinal de objetivos clínicos e metas funcionais
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
                placeholder="Ex: Abotoar camisa com independência em 80% das tentativas"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Categoria
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex: AVD, Fonologia, Práxis"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Data Alvo / Previsão
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Critério de Êxito / Alvo
              </label>
              <input
                type="text"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="Ex: 4 de 5 sessões, 100% autônomo"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Progresso Inicial: {progressPercent}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={progressPercent}
                onChange={(e) => setProgressPercent(Number(e.target.value))}
                className="w-full mt-1 accent-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Critérios de Avaliação e Observações
            </label>
            <input
              type="text"
              value={milestoneNotes}
              onChange={(e) => setMilestoneNotes(e.target.value)}
              placeholder="Notas de suporte, estímulos visuais ou nível de ajuda"
              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
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
      <div className="space-y-2.5">
        {isLoading ? (
          <div className="text-center py-6 text-xs text-slate-400">Carregando metas terapêuticas...</div>
        ) : goals.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
            Nenhuma meta cadastrada ainda. Clique em "+ Nova Meta" para definir objetivos terapêuticos.
          </div>
        ) : (
          goals.map(goal => (
            <div
              key={goal.id}
              className="p-3.5 bg-white border border-slate-200/80 rounded-2xl space-y-2 hover:border-slate-300 transition-colors shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">
                      {goal.title}
                    </span>
                    {goal.category && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {goal.category}
                      </span>
                    )}
                    {getStatusBadge(goal.status)}
                  </div>
                  {goal.milestone_notes && (
                    <p className="text-[11px] text-slate-500">
                      {goal.milestone_notes}
                    </p>
                  )}
                </div>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleDeleteGoal(goal.id)}
                    className="text-slate-400 hover:text-rose-600 p-1 transition cursor-pointer"
                    title="Remover meta"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Progress Bar & Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>Progresso Atual: <strong>{goal.progress_percent}%</strong></span>
                  {goal.target_date && <span>Previsão: {new Date(goal.target_date).toLocaleDateString('pt-BR')}</span>}
                  {goal.target_value && <span className="text-teal-700 font-semibold">Alvo: {goal.target_value}</span>}
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      goal.progress_percent >= 100
                        ? 'bg-emerald-500'
                        : goal.progress_percent >= 50
                        ? 'bg-teal-500'
                        : 'bg-amber-500'
                    }`}
                    style={{ width: `${goal.progress_percent}%` }}
                  />
                </div>

                {!readOnly && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={goal.progress_percent}
                      onChange={(e) => handleUpdateProgress(goal, Number(e.target.value))}
                      className="flex-1 accent-teal-600 h-1 cursor-pointer"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateProgress(goal, 100, 'achieved')}
                        className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-semibold hover:bg-emerald-100 cursor-pointer"
                      >
                        Atingir (100%)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
