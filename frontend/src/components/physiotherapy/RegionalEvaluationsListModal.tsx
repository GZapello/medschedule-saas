import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  AlertCircle,
  Activity,
  Dumbbell,
  Award,
  Trash2,
  Plus,
  GitCompare,
  Edit3
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
  onDeleted?: () => void;
}

const formatEvalDatePtBr = (dateStr?: string | null): string => {
  if (!dateStr) return '—';
  const clean = String(dateStr).split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

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
  onCompareRequested,
  onDeleted
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
      const items = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      setList(items);
    } catch (err: any) {
      console.error('Erro ao carregar lista de avaliações da região:', err);
      showToast(err.message || 'Erro ao carregar histórico da região', 'error');
      setList([]);
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
      onDeleted?.();
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir avaliação regional', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto mobile-modal">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-extrabold text-slate-800">
                Histórico da Região
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                {regionLabel}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-700">
                {formatLaterality(side)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Paciente: <strong className="text-slate-700">{patientName}</strong> • {list.length} {list.length === 1 ? 'avaliação registrada' : 'avaliações registradas'}
            </p>
          </div>

          <button
            aria-label="Fechar"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
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
              let pain: any = null;
              if (item.pain_json) {
                try {
                  pain = typeof item.pain_json === 'string' ? JSON.parse(item.pain_json) : item.pain_json;
                } catch {
                  pain = null;
                }
              }
              const hasPain = pain?.score !== undefined && pain?.score !== null && pain?.score !== '';

              let admList: any[] = [];
              if (item.adm_json) {
                try {
                  const parsed = typeof item.adm_json === 'string' ? JSON.parse(item.adm_json) : item.adm_json;
                  if (Array.isArray(parsed)) admList = parsed;
                } catch {}
              }
              const admRecordedCount = admList.filter(
                a => (a?.activeRom !== undefined && a?.activeRom !== '') || (a?.passiveRom !== undefined && a?.passiveRom !== '')
              ).length;

              let strengthList: any[] = [];
              if (item.strength_json) {
                try {
                  const parsed = typeof item.strength_json === 'string' ? JSON.parse(item.strength_json) : item.strength_json;
                  if (Array.isArray(parsed)) strengthList = parsed;
                } catch {}
              }
              const strengthRecordedCount = strengthList.filter(
                s => s?.grade !== undefined && s?.grade !== ''
              ).length;

              let testsList: any[] = [];
              if (item.tests_json) {
                try {
                  const parsed = typeof item.tests_json === 'string' ? JSON.parse(item.tests_json) : item.tests_json;
                  if (Array.isArray(parsed)) testsList = parsed;
                } catch {}
              }
              const testsRecordedCount = testsList.filter(
                t => t?.result && t.result !== 'not_tested'
              ).length;

              // Note: list is returned DESC by evaluation_date from backend
              const isMostRecent = idx === 0 && list.length > 1;
              const isBaseline = idx === list.length - 1;

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectForEdit?.(item)}
                  className="p-4 rounded-xl border border-slate-200 hover:border-teal-400 bg-white hover:bg-teal-50/15 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatEvalDatePtBr(item.evaluation_date)}
                      </span>
                      {isMostRecent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Atual
                        </span>
                      )}
                      {isBaseline && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          Primeira avaliação
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600">
                      Profissional: <strong className="text-slate-800">{item.professional_name || 'Fisioterapeuta'}</strong>
                    </p>

                    {/* Resumo dos dados registrados */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {hasPain && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                          Dor: {pain.score}/10
                        </span>
                      )}
                      {admRecordedCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-100">
                          <Activity className="w-3 h-3 text-teal-600" />
                          ADM ({admRecordedCount})
                        </span>
                      )}
                      {strengthRecordedCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-100">
                          <Dumbbell className="w-3 h-3 text-indigo-600" />
                          Força ({strengthRecordedCount})
                        </span>
                      )}
                      {testsRecordedCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-100">
                          <Award className="w-3 h-3 text-amber-600" />
                          Testes ({testsRecordedCount})
                        </span>
                      )}
                      {!hasPain && admRecordedCount === 0 && strengthRecordedCount === 0 && testsRecordedCount === 0 && (
                        <span className="text-[11px] text-slate-400">Avaliação clínica registrada</span>
                      )}
                    </div>

                    {item.notes && (
                      <p className="text-xs text-slate-500 line-clamp-2 italic pt-0.5">
                        "{item.notes}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onSelectForEdit && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onSelectForEdit(item);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                    )}

                    {onCompareRequested && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onCompareRequested();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <GitCompare className="w-3.5 h-3.5" />
                        <span>Comparar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={e => handleDelete(item.id, e)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
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
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Nova avaliação
              </button>
            )}

            {list.length >= 1 && onCompareRequested && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCompareRequested();
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-teal-800 bg-teal-100 hover:bg-teal-200 rounded-xl cursor-pointer"
              >
                <GitCompare className="w-3.5 h-3.5" /> Comparar evolução
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
