import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  AlertCircle,
  Activity,
  Trash2,
  Plus,
  ArrowRight,
  TrendingDown,
  User
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  PhysioRegionalEvaluation,
  formatLaterality
} from './regionalData';

interface RegionalEvaluationsListModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  regionId: string;
  regionLabel: string;
  side?: string;
  onSelectForEdit?: (evaluation: PhysioRegionalEvaluation) => void;
  onNewAssessmentRequested?: () => void;
  onCompareRequested?: () => void;
}

export const RegionalEvaluationsListModal: React.FC<RegionalEvaluationsListModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  regionId,
  regionLabel,
  side = 'midline',
  onSelectForEdit,
  onNewAssessmentRequested,
  onCompareRequested
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<PhysioRegionalEvaluation[]>([]);

  useEffect(() => {
    if (isOpen && patientId) {
      loadList();
    }
  }, [isOpen, patientId, regionId]);

  const loadList = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<any>(
        `/v1/physiotherapy/regional-evaluations/patient/${patientId}?region_id=${encodeURIComponent(regionId)}`
      );
      setList(res.data || res || []);
    } catch (err: any) {
      console.error('Erro ao carregar lista de avaliações da região:', err);
      showToast(err.message || 'Erro ao carregar histórico da região', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Deseja realmente excluir esta avaliação regional? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      await ApiClient.delete(`/v1/physiotherapy/regional-evaluations/${id}`);
      showToast('Avaliação regional excluída com sucesso', 'success');
      setList(prev => prev.filter(item => item.id !== id));
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir avaliação regional', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-800">
                Histórico de Avaliações
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                {regionLabel}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-700">
                {formatLaterality(side)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Paciente: <strong className="text-slate-700">{patientName}</strong> • {list.length} avaliação(ões) cadastrada(s)
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="text-center py-10 text-slate-400 text-xs">Carregando histórico...</div>
          ) : list.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Nenhuma avaliação encontrada para esta região.</p>
            </div>
          ) : (
            list.map((item, idx) => {
              const pain = typeof item.pain_json === 'string' ? JSON.parse(item.pain_json) : item.pain_json;
              const painScore = pain?.score ?? 0;

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectForEdit?.(item)}
                  className="p-4 rounded-xl border border-slate-200 hover:border-teal-400 bg-white hover:bg-teal-50/20 cursor-pointer transition-all flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" /> {item.evaluation_date}
                      </span>
                      {idx === 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                          Baseline (1ª)
                        </span>
                      )}
                      {idx === list.length - 1 && list.length > 1 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          Mais Recente
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">
                      Profissional: <strong>{item.professional_name || 'Fisioterapeuta'}</strong>
                    </p>
                    {item.notes && (
                      <p className="text-[11px] text-slate-400 line-clamp-1 italic">"{item.notes}"</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-500">Dor (EVA)</div>
                      <div className="text-base font-black text-rose-600">{painScore}/10</div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDelete(item.id, e)}
                      className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                      title="Excluir avaliação"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onNewAssessmentRequested && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNewAssessmentRequested();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl"
              >
                <Plus className="w-3.5 h-3.5" /> Nova Avaliação
              </button>
            )}

            {list.length >= 2 && onCompareRequested && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCompareRequested();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-teal-800 bg-teal-100 hover:bg-teal-200 rounded-xl"
              >
                <TrendingDown className="w-3.5 h-3.5" /> Comparar Baseline × Atual
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
