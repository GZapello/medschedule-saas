import React, { useState, useEffect } from 'react';
import {
  Trophy,
  X,
  Flame,
  Search,
  ChevronDown,
  ChevronUp,
  Calendar,
  Dumbbell,
  Play,
  TrendingUp,
  Clock,
  History
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { ExerciseDemoDetails } from './PersonalPublicExerciseDemoModal';

export interface StudentRecordItem {
  exercise_id: string | null;
  exercise_name: string;
  muscle_group: string;
  best_load: number;
  best_load_date: string;
  initial_load: number;
  previous_record: number | null;
  evolution_kg: number;
  execution_count: number;
  history: Array<{
    date: string;
    load_kg: number;
    sets_completed: number;
    reps?: string;
  }>;
  photo_url?: string | null;
  gif_url?: string | null;
  gif_attribution?: string | null;
  instructions?: string | null;
}

interface RecordsApiResponse {
  student: { name: string };
  clinicName: string;
  summary: {
    total_workouts_completed: number;
    total_records: number;
    recent_records: StudentRecordItem[];
  };
  records: StudentRecordItem[];
}

interface PersonalPublicStudentRecordsModalProps {
  token: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectExerciseDemo: (exercise: ExerciseDemoDetails) => void;
}

export const PersonalPublicStudentRecordsModal: React.FC<PersonalPublicStudentRecordsModalProps> = ({
  token,
  isOpen,
  onClose,
  onSelectExerciseDemo
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RecordsApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchRecords = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await ApiClient.get<RecordsApiResponse>(
          `/v1/public/personal/workouts/${encodeURIComponent(token)}/records`
        );
        if (isMounted) setData(res);
      } catch (err: any) {
        if (isMounted) {
          setError(err.response?.data?.error || 'Erro ao carregar recordes pessoais');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRecords();
    return () => {
      isMounted = false;
    };
  }, [token, isOpen]);

  // Fecha com ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return isoStr;
    }
  };

  const recordsList = data?.records || [];
  const filteredRecords = recordsList.filter(r =>
    r.exercise_name.toLowerCase().includes(search.toLowerCase()) ||
    r.muscle_group.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Meus Recordes Pessoais"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto relative animate-in zoom-in-95 text-slate-100 selection:bg-teal-500 selection:text-white"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-inner">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                Meus Recordes
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  PRs
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Evolução e melhores cargas conquistadas em séries concluídas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="py-16 text-center space-y-3">
            <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-400">Calculando seus recordes pessoais...</p>
          </div>
        )}

        {/* Erro */}
        {!loading && error && (
          <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-2xl text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Conteúdo Principal */}
        {!loading && !error && data && (
          <>
            {/* KPI Cards de Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-2xl text-left">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Recordes Batidos</span>
                <strong className="text-lg font-black text-amber-400 flex items-center gap-1.5 mt-0.5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  {data.summary.total_records}
                </strong>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-3 rounded-2xl text-left">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Treinos Concluídos</span>
                <strong className="text-lg font-black text-teal-400 flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-4 h-4 text-teal-400" />
                  {data.summary.total_workouts_completed}
                </strong>
              </div>

              <div className="col-span-2 sm:col-span-1 bg-slate-950 border border-slate-800 p-3 rounded-2xl text-left">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Recordes Recentes</span>
                <strong className="text-lg font-black text-emerald-400 flex items-center gap-1.5 mt-0.5">
                  <Flame className="w-4 h-4 text-emerald-400" />
                  {data.summary.recent_records?.length || 0}
                </strong>
              </div>
            </div>

            {/* Destaque de Recordes Recentes (se houver) */}
            {data.summary.recent_records && data.summary.recent_records.length > 0 && (
              <div className="bg-gradient-to-r from-amber-950/30 to-slate-950 border border-amber-500/30 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-black text-xs uppercase tracking-wider">
                  <Flame className="w-4 h-4 fill-amber-400 text-amber-400" />
                  Últimos Recordes Conquistados
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {data.summary.recent_records.slice(0, 4).map((rec, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="truncate mr-2">
                        <span className="font-bold text-slate-200 block truncate">{rec.exercise_name}</span>
                        <span className="text-[10px] text-slate-400">{formatDate(rec.best_load_date)}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-black text-amber-300 text-sm block">{rec.best_load} kg</span>
                        {rec.evolution_kg > 0 && (
                          <span className="text-[10px] font-bold text-emerald-400">
                            +{rec.evolution_kg}kg
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Campo de Busca */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar exercício nos meus recordes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
              />
            </div>

            {/* Lista de Recordes */}
            {recordsList.length === 0 ? (
              <div className="py-12 text-center space-y-3 bg-slate-950/60 border border-slate-800 rounded-3xl p-6">
                <Dumbbell className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="font-bold text-slate-300 text-sm">Nenhum recorde registrado ainda</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Ao concluir as séries dos seus treinos e registrar as cargas executadas, seus recordes aparecerão aqui automaticamente!
                </p>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Nenhum exercício encontrado para "{search}".
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRecords.map((rec, rIdx) => {
                  const key = rec.exercise_id || rec.exercise_name;
                  const isExpanded = expandedExercise === key;

                  return (
                    <div
                      key={rIdx}
                      className="bg-slate-950 border border-slate-800/90 rounded-2xl p-4 space-y-3 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-slate-900 text-teal-300 border border-teal-500/30 text-[10px] font-bold rounded-lg uppercase">
                              {rec.muscle_group || 'Geral'}
                            </span>
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              Recorde em {formatDate(rec.best_load_date)}
                            </span>
                          </div>
                          <h4 className="font-black text-white text-sm sm:text-base leading-snug">
                            {rec.exercise_name}
                          </h4>
                        </div>

                        {/* Carga Máxima Destacada */}
                        <div className="text-right shrink-0 bg-amber-950/30 border border-amber-500/30 px-3 py-1.5 rounded-xl">
                          <span className="text-[9px] uppercase font-black text-amber-400 block tracking-wider">
                            Melhor Carga
                          </span>
                          <strong className="text-base sm:text-lg font-black text-amber-300">
                            {rec.best_load} kg
                          </strong>
                        </div>
                      </div>

                      {/* Métricas de Evolução e Frequência */}
                      <div className="flex items-center justify-between text-xs text-slate-300 flex-wrap gap-2 pt-1 border-t border-slate-900">
                        <div className="flex items-center gap-2">
                          {rec.previous_record ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-500/30 text-[11px]">
                              <TrendingUp className="w-3 h-3" />
                              +{rec.evolution_kg} kg vs recorde anterior ({rec.previous_record} kg)
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] font-medium">
                              1º recorde registrado
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-slate-400">
                          Executado em <strong className="text-slate-200">{rec.execution_count}</strong> {rec.execution_count === 1 ? 'treino' : 'treinos'}
                        </span>
                      </div>

                      {/* Ações: Ver Demonstração & Histórico */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-900 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onSelectExerciseDemo({
                              exercise_id: rec.exercise_id,
                              name: rec.exercise_name,
                              muscle_group: rec.muscle_group,
                              photo_url: rec.photo_url,
                              gif_url: rec.gif_url,
                              gif_attribution: rec.gif_attribution,
                              instructions: rec.instructions
                            })
                          }
                          className="py-1.5 px-3 bg-teal-500/10 hover:bg-teal-500/20 active:bg-teal-500/30 text-teal-300 border border-teal-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-teal-400" />
                          Ver como fazer
                        </button>

                        {rec.history && rec.history.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedExercise(isExpanded ? null : key)}
                            className="py-1.5 px-2.5 text-slate-400 hover:text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>Histórico ({rec.history.length})</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>

                      {/* Histórico Recente de Execuções (Desdobrável) */}
                      {isExpanded && rec.history && (
                        <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-1.5 animate-in slide-in-from-top-2 text-xs">
                          <span className="font-bold text-slate-400 text-[10px] uppercase block tracking-wider">
                            Histórico de Execuções Recentes:
                          </span>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {rec.history.slice(-8).reverse().map((h, hIdx) => (
                              <div
                                key={hIdx}
                                className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-950/60 text-slate-300 text-[11px]"
                              >
                                <span className="text-slate-400">{formatDate(h.date)}</span>
                                <div className="flex items-center gap-2">
                                  {h.sets_completed && (
                                    <span className="text-slate-500">{h.sets_completed} séries</span>
                                  )}
                                  <span className="font-bold text-amber-300 font-mono">{h.load_kg} kg</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Rodapé do Modal */}
        <div className="pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl text-xs sm:text-sm transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
