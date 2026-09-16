import React from 'react';
import {
  Users,
  Dumbbell,
  ClipboardCheck,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Clock,
  Sparkles,
  ChevronRight,
  TrendingUp,
  Activity,
  Plus
} from 'lucide-react';
import { Student } from './types';

interface DashboardMetrics {
  totalStudents: number;
  activeStudents: number;
  activeWorkouts: number;
  monthAssessments: number;
  monthLogs: number;
}

interface PersonalDashboardProps {
  metrics: DashboardMetrics;
  pendingAssessments: any[];
  todayAppointments: any[];
  recentLogs: any[];
  volumeSummary: Array<{ muscle_group: string; total_sets: number }>;
  onSelectStudent: (studentId: string) => void;
  onOpenNewStudent: () => void;
  onOpenNewWorkout: () => void;
  onOpenNewAssessment: () => void;
  onOpenAIAssistant: () => void;
}

export const PersonalDashboard: React.FC<PersonalDashboardProps> = ({
  metrics,
  pendingAssessments,
  todayAppointments,
  recentLogs,
  volumeSummary,
  onSelectStudent,
  onOpenNewStudent,
  onOpenNewWorkout,
  onOpenNewAssessment,
  onOpenAIAssistant
}) => {
  return (
    <div className="space-y-6">
      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Alunos Ativos</span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800">{metrics.activeStudents}</span>
            <span className="text-xs text-slate-500">de {metrics.totalStudents} cadastrados</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Treinos Prescritos</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Dumbbell className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800">{metrics.activeWorkouts}</span>
            <span className="text-xs text-emerald-600 font-medium">divisões ativas</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Avaliações no Mês</span>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800">{metrics.monthAssessments}</span>
            <span className="text-xs text-slate-500">compostas e dobras</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Treinos Concluídos</span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800">{metrics.monthLogs}</span>
            <span className="text-xs text-slate-500">execuções este mês</span>
          </div>
        </div>
      </div>

      {/* Barra de Ações Rápidas */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-5 text-white flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <span>⚡ Ações Rápidas de Treinamento</span>
          </h3>
          <p className="text-xs text-slate-300">
            Gerencie prescrições, novas avaliações de composição corporal e acesse o assistente inteligente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onOpenNewStudent}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/10"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Aluno
          </button>
          <button
            onClick={onOpenNewWorkout}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Dumbbell className="w-3.5 h-3.5" />
            Prescrever Treino
          </button>
          <button
            onClick={onOpenNewAssessment}
            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Nova Avaliação Física
          </button>
          <button
            onClick={onOpenAIAssistant}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Assistente IA
          </button>
        </div>
      </div>

      {/* Grid Central: Agenda do Dia e Alunos com Avaliação Vencida */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aulas / Atendimentos de Hoje */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Aulas & Atendimentos de Hoje</span>
            </h4>
            <span className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 font-semibold rounded-full">
              {todayAppointments.length} agendados
            </span>
          </div>

          <div className="mt-4 divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
            {todayAppointments.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                Nenhum agendamento para hoje na grade de atendimento.
              </div>
            ) : (
              todayAppointments.map((appt) => (
                <div
                  key={appt.id}
                  onClick={() => onSelectStudent(appt.patient_id)}
                  className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs uppercase overflow-hidden">
                      {appt.avatar_url ? (
                        <img src={appt.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        appt.patient_name.slice(0, 2)
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 text-xs">{appt.patient_name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {appt.start_time} - {appt.end_time || 'Duração padrão'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        appt.status === 'confirmed'
                          ? 'bg-emerald-50 text-emerald-700'
                          : appt.status === 'completed'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {appt.status === 'confirmed' ? 'Confirmado' : appt.status === 'completed' ? 'Realizado' : 'Agendado'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Avaliações Físicas Pendentes / Vencidas */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Avaliações Físicas Pendentes (&gt; 60 dias)</span>
            </h4>
            <span className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 font-semibold rounded-full">
              {pendingAssessments.length} alunos
            </span>
          </div>

          <div className="mt-4 divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
            {pendingAssessments.length === 0 ? (
              <div className="text-center py-8 text-emerald-600 text-xs font-medium flex flex-col items-center gap-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                Todas as avaliações dos alunos ativos estão em dia!
              </div>
            ) : (
              pendingAssessments.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onSelectStudent(p.id)}
                  className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold text-xs uppercase">
                      {p.name.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 text-xs">{p.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {p.last_assessment_date
                          ? `Última em: ${new Date(p.last_assessment_date).toLocaleDateString('pt-BR')} (${p.days_since_last} dias)`
                          : 'Nunca avaliado'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectStudent(p.id);
                    }}
                    className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Avaliar
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Grid Inferior: Volume Semanal por Músculo e Treinos Recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Distribuição de Séries Semanais */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm lg:col-span-1">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span>Volume Semanal Médio (Séries)</span>
            </h4>
          </div>

          <div className="mt-4 space-y-3">
            {volumeSummary.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                Nenhum treino com exercícios cadastrado ainda.
              </div>
            ) : (
              volumeSummary.slice(0, 6).map((item) => {
                const maxVal = Math.max(...volumeSummary.map((v) => v.total_sets), 20);
                const pct = Math.min(100, Math.round((item.total_sets / maxVal) * 100));
                return (
                  <div key={item.muscle_group} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-700 capitalize">{item.muscle_group}</span>
                      <span className="text-indigo-600">{item.total_sets} séries</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Últimas Execuções de Treino */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <span>Últimos Treinos Concluídos</span>
            </h4>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {recentLogs.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                Nenhuma execução registrada recentemente.
              </div>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs flex items-center justify-center uppercase">
                      {log.patient_name.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 text-xs">
                        {log.patient_name} —{' '}
                        <span className="text-emerald-700">
                          {log.division ? `Treino ${log.division}` : ''} {log.workout_title || ''}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(log.completed_at).toLocaleString('pt-BR')} •{' '}
                        {log.duration_minutes ? `${log.duration_minutes} min` : 'Duração não informada'} •{' '}
                        {log.rpe ? `RPE ${log.rpe}/10` : 'Sem RPE'}
                      </div>
                      {log.feedback_notes && (
                        <div className="text-[11px] text-slate-600 italic mt-0.5">
                          "{log.feedback_notes}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
