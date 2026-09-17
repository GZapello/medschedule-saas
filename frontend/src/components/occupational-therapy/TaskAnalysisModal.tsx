import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, CheckCircle2, Layers, AlertTriangle, Lightbulb, Save, History } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface TaskStep {
  stepNumber: number;
  description: string;
  assistanceLevel: 'independent' | 'supervision' | 'verbal_cue' | 'partial_physical' | 'total_physical';
  barriers?: string;
  adaptations?: string;
}

export interface TaskAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
}

const PRESET_ACTIVITIES = [
  'Amarrar os Cadarços',
  'Escovação dos Dentes',
  'Vestir Calça e Meias',
  'Abotoar Camisa',
  'Preparar Lanche Simples',
  'Banho Completo',
  'Uso do Vaso Sanitário',
  'Alimentar-se com Garfo e Faca',
  'Organizar Material Escolar'
];

export const TaskAnalysisModal: React.FC<TaskAnalysisModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName
}) => {
  const { showToast } = useToast();
  const [activityName, setActivityName] = useState('');
  const [steps, setSteps] = useState<TaskStep[]>([
    { stepNumber: 1, description: '', assistanceLevel: 'independent', barriers: '', adaptations: '' }
  ]);
  const [barriers, setBarriers] = useState('');
  const [adaptations, setAdaptations] = useState('');
  const [strategies, setStrategies] = useState('');
  const [notes, setNotes] = useState('');

  const [pastAnalyses, setPastAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');

  useEffect(() => {
    if (isOpen && patientId) {
      loadHistory();
    }
  }, [isOpen, patientId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<any[]>(`/v1/occupational-therapy/task-analyses/${patientId}`);
      if (Array.isArray(res)) {
        setPastAnalyses(res);
      }
    } catch (err) {
      console.warn('Erro ao carregar análises de tarefas:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleAddStep = () => {
    setSteps([
      ...steps,
      {
        stepNumber: steps.length + 1,
        description: '',
        assistanceLevel: 'independent',
        barriers: '',
        adaptations: ''
      }
    ]);
  };

  const handleRemoveStep = (idx: number) => {
    const updated = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepNumber: i + 1 }));
    setSteps(updated);
  };

  const handleUpdateStep = (idx: number, field: keyof TaskStep, value: any) => {
    const updated = [...steps];
    updated[idx] = { ...updated[idx], [field]: value };
    setSteps(updated);
  };

  const handleSave = async () => {
    if (!activityName.trim()) {
      showToast('Informe o nome da atividade', 'info');
      return;
    }
    const validSteps = steps.filter(s => s.description.trim());
    if (validSteps.length === 0) {
      showToast('Adicione ao menos uma etapa com descrição', 'info');
      return;
    }

    try {
      setSaving(true);
      await ApiClient.post('/v1/occupational-therapy/task-analyses', {
        patientId,
        activityName,
        steps: validSteps,
        barriers,
        adaptations,
        strategies,
        notes
      });
      showToast('Análise de tarefas registrada com sucesso!', 'success');
      loadHistory();
      setActiveTab('history');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar análise de tarefas', 'error');
    } finally {
      setSaving(false);
    }
  };

  const assistanceBadge = (level: string) => {
    switch (level) {
      case 'independent':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Independente</span>;
      case 'supervision':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">Supervisão</span>;
      case 'verbal_cue':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Pista Verbal</span>;
      case 'partial_physical':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800">Ajuda Física Parcial</span>;
      case 'total_physical':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">Ajuda Física Total</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{level}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Análise de Tarefas Ocupacionais (Task Analysis)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Decomposição minuciosa de atividades da vida diária, barreiras e níveis de suporte {patientName ? `• ${patientName}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex gap-4">
          <button
            onClick={() => setActiveTab('create')}
            className={`pb-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'create'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            Nova Análise de Tarefa
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Histórico ({pastAnalyses.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'create' ? (
            <>
              {/* Seleção ou digitação da atividade */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nome da Atividade / Ocupação *
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PRESET_ACTIVITIES.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setActivityName(preset)}
                      className={`px-2.5 py-1 text-[11px] rounded-lg border font-semibold transition-all cursor-pointer ${
                        activityName === preset
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Ex: Calçar tênis com cadarço, Preparar café da manhã..."
                  value={activityName}
                  onChange={e => setActivityName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:border-indigo-500 font-semibold"
                />
              </div>

              {/* Lista de Etapas Decompostas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Etapas Decompostas da Atividade
                  </label>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Etapa
                  </button>
                </div>

                <div className="space-y-3">
                  {steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Etapa {idx + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={step.assistanceLevel}
                            onChange={e => handleUpdateStep(idx, 'assistanceLevel', e.target.value)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                          >
                            <option value="independent">Independente</option>
                            <option value="supervision">Supervisão / Preparo</option>
                            <option value="verbal_cue">Pista Verbal / Comando</option>
                            <option value="partial_physical">Ajuda Física Parcial</option>
                            <option value="total_physical">Ajuda Física Total</option>
                          </select>
                          {steps.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveStep(idx)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <input
                          type="text"
                          placeholder="Descrição do que o paciente deve realizar nesta etapa..."
                          value={step.description}
                          onChange={e => handleUpdateStep(idx, 'description', e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <div>
                          <input
                            type="text"
                            placeholder="Barreiras (ex: fraqueza de pinça, desatenção)..."
                            value={step.barriers || ''}
                            onChange={e => handleUpdateStep(idx, 'barriers', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Adaptações / Pistas (ex: apoio de mesa, velcro)..."
                            value={step.adaptations || ''}
                            onChange={e => handleUpdateStep(idx, 'adaptations', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Barreiras Gerais e Facilitadores */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Barreiras Clínicas & Contextuais Gerais
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Barreiras sensoriais, cognitivas, motoras ou ambientais..."
                    value={barriers}
                    onChange={e => setBarriers(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-indigo-500" />
                    Facilitadores, Adaptações e Estratégias
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Recursos de tecnologia assistiva, adequação de rotina, suportes visuais..."
                    value={adaptations}
                    onChange={e => setAdaptations(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-400">Carregando histórico...</div>
              ) : pastAnalyses.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/20 rounded-2xl">
                  Nenhuma análise de tarefas gravada para este paciente ainda.
                </div>
              ) : (
                pastAnalyses.map((item: any) => {
                  let parsedSteps: any[] = [];
                  try {
                    parsedSteps = typeof item.steps_json === 'string' ? JSON.parse(item.steps_json) : item.steps_json || [];
                  } catch {}

                  return (
                    <div
                      key={item.id}
                      className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                          {item.activity_name}
                        </h4>
                        <span className="text-[11px] text-slate-400">
                          {new Date(item.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      {/* Steps table */}
                      <div className="space-y-2 pt-1">
                        {parsedSteps.map((st: any, i: number) => (
                          <div
                            key={i}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-indigo-600">{i + 1}.</span>
                              <span className="text-slate-800 dark:text-slate-200 font-medium">
                                {st.description}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {assistanceBadge(st.assistanceLevel)}
                              {st.adaptations && (
                                <span className="text-[10px] text-slate-500 italic bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                  {st.adaptations}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {(item.barriers || item.adaptations) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-500">
                          {item.barriers && <div><strong>Barreiras:</strong> {item.barriers}</div>}
                          {item.adaptations && <div><strong>Adaptações:</strong> {item.adaptations}</div>}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === 'create' && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Análise de Tarefa'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
