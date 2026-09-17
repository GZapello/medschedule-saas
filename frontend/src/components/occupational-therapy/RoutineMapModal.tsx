import React, { useState, useEffect } from 'react';
import { X, Clock, Sun, Sunrise, Sunset, Moon, Plus, Trash2, Save, Sparkles, CheckCircle2 } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface RoutineBlock {
  id: string;
  period: 'morning' | 'afternoon' | 'evening' | 'night';
  timeRange: string;
  activity: string;
  engagement: 'high' | 'medium' | 'low' | 'none';
  sensoryChallenges: string;
  independence: 'independent' | 'assisted' | 'dependent';
}

export interface RoutineMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
}

const DEFAULT_BLOCKS: RoutineBlock[] = [
  {
    id: '1',
    period: 'morning',
    timeRange: '07:00 - 08:30',
    activity: 'Despertar, higiene matinal e café da manhã',
    engagement: 'medium',
    sensoryChallenges: 'Sensibilidade à luz natural e transição rápida de sono',
    independence: 'assisted'
  },
  {
    id: '2',
    period: 'morning',
    timeRange: '08:30 - 12:00',
    activity: 'Escola / Atividades Pedagógicas ou Trabalho',
    engagement: 'high',
    sensoryChallenges: 'Sobrecarga de ruídos em sala de aula / ambiente compartilhado',
    independence: 'independent'
  },
  {
    id: '3',
    period: 'afternoon',
    timeRange: '12:00 - 13:30',
    activity: 'Almoço e descanso breve',
    engagement: 'high',
    sensoryChallenges: 'Seletividade alimentar (recusa texturas pastosas/carnes)',
    independence: 'independent'
  },
  {
    id: '4',
    period: 'afternoon',
    timeRange: '14:00 - 18:00',
    activity: 'Brincar / Tarefas de casa / Terapias',
    engagement: 'high',
    sensoryChallenges: 'Necessidade de pausas proprioceptivas para manter foco',
    independence: 'assisted'
  },
  {
    id: '5',
    period: 'evening',
    timeRange: '18:30 - 20:30',
    activity: 'Banho noturno, jantar e convivência familiar',
    engagement: 'medium',
    sensoryChallenges: 'Desaceleração lenta, agitação pré-sono',
    independence: 'assisted'
  },
  {
    id: '6',
    period: 'night',
    timeRange: '21:00 - 06:30',
    activity: 'Sono contínuo',
    engagement: 'none',
    sensoryChallenges: 'Despertares noturnos esporádicos (1-2x)',
    independence: 'independent'
  }
];

export const RoutineMapModal: React.FC<RoutineMapModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName
}) => {
  const { showToast } = useToast();
  const [blocks, setBlocks] = useState<RoutineBlock[]>(DEFAULT_BLOCKS);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && patientId) {
      loadRoutine();
    }
  }, [isOpen, patientId]);

  const loadRoutine = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<any>(`/v1/occupational-therapy/routine-map/${patientId}`);
      if (res && res.time_blocks_json) {
        const parsed = typeof res.time_blocks_json === 'string' ? JSON.parse(res.time_blocks_json) : res.time_blocks_json;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setBlocks(parsed);
        }
        if (res.notes) setNotes(res.notes);
      }
    } catch (err) {
      console.warn('Erro ao carregar mapa de rotina:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleAddBlock = (period: RoutineBlock['period']) => {
    const newBlock: RoutineBlock = {
      id: Math.random().toString(36).substring(2, 9),
      period,
      timeRange: period === 'morning' ? '09:00 - 10:00' : period === 'afternoon' ? '15:00 - 16:00' : '19:00 - 20:00',
      activity: '',
      engagement: 'medium',
      sensoryChallenges: '',
      independence: 'assisted'
    };
    setBlocks([...blocks, newBlock]);
  };

  const handleUpdateBlock = (id: string, field: keyof RoutineBlock, value: any) => {
    setBlocks(blocks.map(b => (b.id === id ? { ...b, [field]: value } : b)));
  };

  const handleRemoveBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await ApiClient.post('/v1/occupational-therapy/routine-map', {
        patientId,
        timeBlocks: blocks,
        notes
      });
      showToast('Mapa de rotina diária atualizado com sucesso!', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar mapa de rotina', 'error');
    } finally {
      setSaving(false);
    }
  };

  const periodConfig = {
    morning: { title: 'Manhã', icon: Sunrise, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    afternoon: { title: 'Tarde', icon: Sun, color: 'text-orange-600 bg-orange-50 border-orange-200' },
    evening: { title: 'Noite', icon: Sunset, color: 'text-teal-600 bg-teal-50 border-teal-200' },
    night: { title: 'Madrugada / Sono', icon: Moon, color: 'text-slate-600 bg-slate-100 border-slate-200' }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Mapa da Rotina Diária de Vida
              </h2>
              <p className="text-xs text-slate-500">
                Mapeamento temporal das 24 horas, desafios sensoriais e engajamento ocupacional {patientName ? `• ${patientName}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#fafbfc]">
          {(['morning', 'afternoon', 'evening', 'night'] as const).map(period => {
            const conf = periodConfig[period];
            const Icon = conf.icon;
            const periodBlocks = blocks.filter(b => b.period === period);

            return (
              <div key={period} className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`p-1.5 rounded-lg border ${conf.color}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <h3 className="text-xs font-bold text-slate-800">
                      {conf.title} ({periodBlocks.length} atividades)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddBlock(period)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Adicionar Bloco
                  </button>
                </div>

                <div className="space-y-2">
                  {periodBlocks.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                      Nenhum evento registrado para este turno.
                    </div>
                  ) : (
                    periodBlocks.map(b => (
                      <div
                        key={b.id}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={b.timeRange}
                              placeholder="08:00 - 09:00"
                              onChange={e => handleUpdateBlock(b.id, 'timeRange', e.target.value)}
                              className="w-28 px-2 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-800"
                            />
                            <input
                              type="text"
                              value={b.activity}
                              placeholder="Atividade ou ocupação desempenhada..."
                              onChange={e => handleUpdateBlock(b.id, 'activity', e.target.value)}
                              className="flex-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={b.engagement}
                              onChange={e => handleUpdateBlock(b.id, 'engagement', e.target.value)}
                              className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-800"
                            >
                              <option value="high">Engajamento Alto</option>
                              <option value="medium">Engajamento Médio</option>
                              <option value="low">Engajamento Baixo</option>
                              <option value="none">Passivo / Sem Engajamento</option>
                            </select>

                            <select
                              value={b.independence}
                              onChange={e => handleUpdateBlock(b.id, 'independence', e.target.value)}
                              className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-800"
                            >
                              <option value="independent">Independente</option>
                              <option value="assisted">Com Assistência</option>
                              <option value="dependent">Dependente</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => handleRemoveBlock(b.id)}
                              className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <input
                            type="text"
                            value={b.sensoryChallenges}
                            placeholder="Desafios sensoriais, pistas ou sobrecarga observada..."
                            onChange={e => handleUpdateBlock(b.id, 'sensoryChallenges', e.target.value)}
                            className="w-full px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-teal-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}

          <div className="space-y-1.5 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <label className="block text-xs font-bold text-slate-800">
              Síntese Ocupacional da Rotina & Orientações de Reorganização
            </label>
            <textarea
              rows={3}
              placeholder="Identificação de picos de estresse, janelas de maior alerta funcional, propostas de pausas sensoriais..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar Mapa de Rotina'}
          </button>
        </div>
      </div>
    </div>
  );
};
