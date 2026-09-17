import React, { useState, useEffect } from 'react';
import { X, Heart, Star, CheckCircle2, Save, User, Sparkles, Smile, Shield } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface ParticipationDomain {
  key: string;
  name: string;
  description: string;
  level: 'autonomous' | 'supported' | 'restricted' | 'absent';
  satisfaction: number; // 1-5
  currentRoles: string;
  desiredRoles: string;
  barriers: string;
}

export interface OccupationalParticipationModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
}

const DEFAULT_DOMAINS: ParticipationDomain[] = [
  {
    key: 'self_care',
    name: 'Autocuidado e Vida Prática',
    description: 'Higiene, alimentação, vestuário, gestão da saúde e mobilidade',
    level: 'supported',
    satisfaction: 4,
    currentRoles: 'Cuidador de si com suporte',
    desiredRoles: 'Independência matinal',
    barriers: ''
  },
  {
    key: 'productivity',
    name: 'Produtividade / Ocupações Laborais',
    description: 'Trabalho remunerado, tarefas domésticas, voluntariado',
    level: 'autonomous',
    satisfaction: 4,
    currentRoles: 'Profissional / Trabalhador',
    desiredRoles: 'Manutenção de ergonomia e redução de fadiga',
    barriers: ''
  },
  {
    key: 'education',
    name: 'Educação e Aprendizagem',
    description: 'Frequência escolar, cursos, estudos e atividades acadêmicas',
    level: 'autonomous',
    satisfaction: 4,
    currentRoles: 'Estudante',
    desiredRoles: 'Aprimoramento de organização temporal',
    barriers: ''
  },
  {
    key: 'play',
    name: 'Brincar (Pediatria e Desenvolvimento)',
    description: 'Exploração lúdica, brincadeiras estruturadas e compartilhadas',
    level: 'autonomous',
    satisfaction: 5,
    currentRoles: 'Criança em desenvolvimento',
    desiredRoles: 'Brincadeiras cooperativas com pares',
    barriers: ''
  },
  {
    key: 'leisure',
    name: 'Lazer e Recreação',
    description: 'Hobbies, esportes, interesses culturais e momentos prazerosos',
    level: 'supported',
    satisfaction: 3,
    currentRoles: 'Praticante de hobbies',
    desiredRoles: 'Maior participação em atividades ao ar livre',
    barriers: ''
  },
  {
    key: 'social',
    name: 'Participação Social e Comunitária',
    description: 'Relações familiares, amizades, eventos na comunidade',
    level: 'supported',
    satisfaction: 3,
    currentRoles: 'Membro familiar e comunitário',
    desiredRoles: 'Autonomia em saídas sociais sem cuidadores',
    barriers: ''
  },
  {
    key: 'sleep',
    name: 'Sono e Descanso',
    description: 'Preparação para o sono, continuidade do descanso e restauração',
    level: 'autonomous',
    satisfaction: 4,
    currentRoles: 'Dormidor típico',
    desiredRoles: 'Higiene do sono regular',
    barriers: ''
  }
];

export const OccupationalParticipationModal: React.FC<OccupationalParticipationModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName
}) => {
  const { showToast } = useToast();
  const [domains, setDomains] = useState<ParticipationDomain[]>(DEFAULT_DOMAINS);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && patientId) {
      loadParticipation();
    }
  }, [isOpen, patientId]);

  const loadParticipation = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<any>(`/v1/occupational-therapy/participation/${patientId}`);
      if (res && res.participation_json) {
        const parsed = typeof res.participation_json === 'string' ? JSON.parse(res.participation_json) : res.participation_json;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDomains(parsed);
        }
        if (res.notes) setNotes(res.notes);
      }
    } catch (err) {
      console.warn('Erro ao carregar participação ocupacional:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleUpdate = (idx: number, field: keyof ParticipationDomain, value: any) => {
    const updated = [...domains];
    updated[idx] = { ...updated[idx], [field]: value };
    setDomains(updated);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await ApiClient.post('/v1/occupational-therapy/participation', {
        patientId,
        participation: domains,
        notes
      });
      showToast('Participação Ocupacional (MOHO) atualizada!', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar participação ocupacional', 'error');
    } finally {
      setSaving(false);
    }
  };

  const levelColor = (level: string) => {
    switch (level) {
      case 'autonomous':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300';
      case 'supported':
        return 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300';
      case 'restricted':
        return 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300';
      case 'absent':
        return 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/30 dark:text-red-300';
      default:
        return 'text-slate-700 bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Heart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Participação Ocupacional (Modelo da Ocupação Humana - MOHO)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Engajamento em papéis significativos, satisfação e barreiras contextuais {patientName ? `• ${patientName}` : ''}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {domains.map((d, idx) => (
              <div
                key={d.key}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 shadow-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      {d.name}
                    </h3>
                    <p className="text-[11px] text-slate-400">{d.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={d.level}
                      onChange={e => handleUpdate(idx, 'level', e.target.value)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-xl border ${levelColor(d.level)}`}
                    >
                      <option value="autonomous">Autônomo / Independente</option>
                      <option value="supported">Participa com Suporte</option>
                      <option value="restricted">Participação Restrita</option>
                      <option value="absent">Ausente / Não Engajado</option>
                    </select>

                    <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-xl border border-amber-200 dark:border-amber-800">
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">Satisfação:</span>
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => handleUpdate(idx, 'satisfaction', star)}
                          className="focus:outline-none cursor-pointer"
                        >
                          <Star
                            className={`w-3.5 h-3.5 ${
                              star <= d.satisfaction
                                ? 'text-amber-500 fill-amber-500'
                                : 'text-slate-300 dark:text-slate-600'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Papéis Desempenhados Atualmente
                    </label>
                    <input
                      type="text"
                      value={d.currentRoles}
                      placeholder="Ex: Estudante, filho(a), trabalhador..."
                      onChange={e => handleUpdate(idx, 'currentRoles', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Papéis Desejados / Metas de Identidade
                    </label>
                    <input
                      type="text"
                      value={d.desiredRoles}
                      placeholder="Ex: Cozinhar para si, frequentar academia..."
                      onChange={e => handleUpdate(idx, 'desiredRoles', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Barreiras Encontradas
                    </label>
                    <input
                      type="text"
                      value={d.barriers || ''}
                      placeholder="Ex: Acessibilidade física, atitudes..."
                      onChange={e => handleUpdate(idx, 'barriers', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Parecer Terapêutico Ocupacional Geral sobre Volição e Hábitos
            </label>
            <textarea
              rows={3}
              placeholder="Síntese da volição (motivação intrínseca para agir), habituação (padrões de rotina) e capacidade de desempenho..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar Participação'}
          </button>
        </div>
      </div>
    </div>
  );
};
