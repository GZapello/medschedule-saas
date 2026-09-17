import React, { useState, useEffect } from 'react';
import { Activity, Target, BookOpen, Layers, CheckCircle2, AlertTriangle, TrendingUp, Clock, User } from 'lucide-react';
import { ApiClient } from '../../api/client';

export interface TODashboardViewProps {
  patientId: string;
}

export const TODashboardView: React.FC<TODashboardViewProps> = ({ patientId }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (patientId) loadDashboard();
  }, [patientId]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<any>(`/v1/occupational-therapy/dashboard/${patientId}`);
      setData(res);
    } catch (err) {
      console.error('[TODashboardView] Erro ao carregar dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-400">Carregando painel funcional do paciente...</div>;
  }

  const independenceRate = data?.independenceRate || 0;
  const sensoryAlerts = data?.sensoryAlerts || [];
  const goalsCount = data?.goalsCount || { total: 0, achieved: 0, in_progress: 0 };
  const homeProgramsCount = data?.homeProgramsCount || 0;
  const recentAvd = data?.recentAvd;

  return (
    <div className="space-y-6">
      {/* 4 Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Taxa de Independência em AVD */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Índice Geral de AVDs</span>
            <Activity className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
            {independenceRate}%
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                independenceRate >= 75 ? 'bg-emerald-500' : independenceRate >= 45 ? 'bg-indigo-500' : 'bg-amber-500'
              }`}
              style={{ width: `${independenceRate}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            {independenceRate >= 75 ? 'Independência funcional elevada' : 'Assistência requerida em rotinas'}
          </p>
        </div>

        {/* Metas Terapêuticas */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Metas Terapêuticas</span>
            <Target className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {goalsCount.achieved} <span className="text-sm font-semibold text-slate-400">/ {goalsCount.total}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="text-blue-600 font-bold">{goalsCount.in_progress} em andamento</span>
          </div>
        </div>

        {/* Perfil Sensorial */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Sistemas Sensoriais</span>
            <Layers className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-black text-amber-600 dark:text-amber-400">
            {sensoryAlerts.length}
          </div>
          <p className="text-[11px] text-slate-400">
            {sensoryAlerts.length === 0 ? 'Padrão típico em todos os 8 sistemas' : 'Sistemas com busca ou hiper-reatividade'}
          </p>
        </div>

        {/* Programa Casa/Escola */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Orientações Ativas</span>
            <BookOpen className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-3xl font-black text-purple-600 dark:text-purple-400">
            {homeProgramsCount}
          </div>
          <p className="text-[11px] text-slate-400">
            Programas para casa, escola e cuidadores
          </p>
        </div>
      </div>

      {/* Detalhamento de Alertas Sensoriais */}
      {sensoryAlerts.length > 0 && (
        <div className="p-5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-3xl space-y-3">
          <h4 className="text-xs font-black text-amber-950 dark:text-amber-300 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Alertas de Regulação e Processamento Sensorial
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {sensoryAlerts.map((alert: any, idx: number) => (
              <div key={idx} className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-amber-100 dark:border-amber-800 space-y-1">
                <span className="text-xs font-bold text-slate-900 dark:text-white capitalize">
                  {alert.system}
                </span>
                <div className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                  Padrão: {alert.pattern}
                </div>
                {alert.notes && <p className="text-[10px] text-slate-500">{alert.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico Recente de AVDs */}
      {recentAvd && (
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              Última Avaliação Funcional Registrada
            </h4>
            <span className="text-[11px] text-slate-400">
              {recentAvd.assessment_date ? new Date(recentAvd.assessment_date).toLocaleDateString('pt-BR') : '-'}
            </span>
          </div>
          {recentAvd.general_notes && (
            <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl">
              {recentAvd.general_notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
