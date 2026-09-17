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
        <div className="p-5 bg-white border border-slate-200/80 rounded-3xl space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Índice Geral de AVDs</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-teal-600">
            {independenceRate}%
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                independenceRate >= 75 ? 'bg-emerald-500' : independenceRate >= 45 ? 'bg-teal-500' : 'bg-amber-500'
              }`}
              style={{ width: `${independenceRate}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {independenceRate >= 75 ? 'Independência funcional elevada' : 'Assistência requerida em rotinas'}
          </p>
        </div>

        {/* Metas Terapêuticas */}
        <div className="p-5 bg-white border border-slate-200/80 rounded-3xl space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Metas Terapêuticas</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-600">
            {goalsCount.achieved} <span className="text-sm font-semibold text-slate-400">/ {goalsCount.total}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">{goalsCount.in_progress} em andamento</span>
          </div>
        </div>

        {/* Perfil Sensorial */}
        <div className="p-5 bg-white border border-slate-200/80 rounded-3xl space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Sistemas Sensoriais</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-600">
            {sensoryAlerts.length}
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {sensoryAlerts.length === 0 ? 'Padrão típico em todos os 8 sistemas' : 'Sistemas com busca ou hiper-reatividade'}
          </p>
        </div>

        {/* Programa Casa/Escola */}
        <div className="p-5 bg-white border border-slate-200/80 rounded-3xl space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Orientações Ativas</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-700">
            {homeProgramsCount}
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            Programas para casa, escola e cuidadores
          </p>
        </div>
      </div>

      {/* Detalhamento de Alertas Sensoriais */}
      {sensoryAlerts.length > 0 && (
        <div className="p-5 bg-amber-50/70 border border-amber-200/80 rounded-3xl space-y-3">
          <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Alertas de Regulação e Processamento Sensorial
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {sensoryAlerts.map((alert: any, idx: number) => (
              <div key={idx} className="p-3 bg-white rounded-2xl border border-amber-200/80 space-y-1 shadow-xs">
                <span className="text-xs font-bold text-slate-900 capitalize">
                  {alert.system}
                </span>
                <div className="text-[11px] text-amber-800 font-semibold">
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
        <div className="p-5 bg-white border border-slate-200/80 rounded-3xl space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              Última Avaliação Funcional Registrada
            </h4>
            <span className="text-[11px] text-slate-400 font-medium">
              {recentAvd.assessment_date ? new Date(recentAvd.assessment_date).toLocaleDateString('pt-BR') : '-'}
            </span>
          </div>
          {recentAvd.general_notes && (
            <p className="text-xs text-slate-700 bg-slate-50 border border-slate-100 p-3.5 rounded-2xl leading-relaxed">
              {recentAvd.general_notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
