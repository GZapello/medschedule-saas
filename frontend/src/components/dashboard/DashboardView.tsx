import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  UserX,
  DollarSign,
  TrendingUp,
  Plus,
  ArrowRight,
  AlertCircle,
  Video,
  MapPin,
  RefreshCw
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
  onOpenNewAppointment: () => void;
  onOpenNewPatient: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenNewAppointment,
  onOpenNewPatient
}) => {
  const { clientTermLabel } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [metrics, setMetrics] = useState<any>(null);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.get<any>('/v1/dashboard/metrics');
      setMetrics(data);
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar indicadores', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const handleUpdateStatus = async (appointmentId: string, newStatus: string) => {
    try {
      await ApiClient.put(`/v1/appointments/${appointmentId}/status`, { status: newStatus });
      showToast(`Status atualizado para ${newStatus}!`, 'success');
      fetchMetrics();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar status', 'error');
    }
  };

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-full">Confirmado</span>;
      case 'in_progress':
        return <span className="bg-purple-100 text-purple-800 text-xs font-semibold px-2.5 py-1 rounded-full animate-pulse">Em Atendimento</span>;
      case 'completed':
        return <span className="bg-teal-100 text-teal-800 text-xs font-semibold px-2.5 py-1 rounded-full">Concluído</span>;
      case 'cancelled':
        return <span className="bg-rose-100 text-rose-800 text-xs font-semibold px-2.5 py-1 rounded-full">Cancelado</span>;
      case 'no_show':
        return <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-full">Faltou</span>;
      default:
        return <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-1 rounded-full">Agendado</span>;
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-slate-500 font-medium text-sm">Carregando métricas e atendimentos...</p>
        </div>
      </div>
    );
  }

  const todayList = metrics?.today?.appointments || [];

  return (
    <div className="space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Painel Operacional</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Visão geral dos atendimentos, ocupação e financeiro em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onOpenNewPatient}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo {clientTermLabel}
          </button>
          <button
            onClick={onOpenNewAppointment}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Agendamento
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Atendimentos Hoje */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Hoje</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <CalendarIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics?.today?.total || 0}</div>
          <p className="text-xs text-slate-400 mt-1">atendimentos agendados</p>
        </div>

        {/* Concluídos Mês */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Realizados</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics?.monthly?.completed || 0}</div>
          <p className="text-xs text-slate-400 mt-1">finalizados no mês</p>
        </div>

        {/* Faltas / No-Show */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Faltas</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics?.monthly?.noShow || 0}</div>
          <p className="text-xs text-slate-400 mt-1">taxa de ausência</p>
        </div>

        {/* Faturamento Recebido */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Receita</span>
            <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 truncate">
            {formatCurrency(metrics?.monthly?.revenue)}
          </div>
          <p className="text-xs text-slate-400 mt-1">recebido no mês</p>
        </div>

        {/* Valores Pendentes */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Pendente</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 truncate">
            {formatCurrency(metrics?.monthly?.pending)}
          </div>
          <p className="text-xs text-slate-400 mt-1">a receber</p>
        </div>

        {/* Taxa de Ocupação */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Ocupação</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics?.monthly?.occupancyRate || 0}%</div>
          <p className="text-xs text-slate-400 mt-1">da capacidade total</p>
        </div>
      </div>

      {/* Main Content Area: Today's Appointments & Monthly Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Atendimentos de Hoje (2/3 width) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Agenda de Hoje</h3>
              <p className="text-xs text-slate-500">Acompanhe os clientes e altere o status com agilidade.</p>
            </div>
            <button
              onClick={() => onNavigate('calendar')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              Ver agenda completa <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {todayList.length === 0 ? (
            <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
              <p className="font-medium text-sm">Nenhum atendimento agendado para hoje.</p>
              <button
                onClick={onOpenNewAppointment}
                className="mt-3 text-xs font-semibold text-indigo-600 hover:underline"
              >
                + Criar agendamento agora
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {todayList.map((appt: any) => {
                const startTime = appt.start_time?.split('T')[1]?.slice(0, 5) || '00:00';
                const endTime = appt.end_time?.split('T')[1]?.slice(0, 5) || '00:00';

                return (
                  <div key={appt.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 p-2 rounded-xl transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex flex-col items-center justify-center flex-shrink-0 font-bold">
                        <span className="text-xs leading-none">{startTime}</span>
                        <span className="text-[10px] text-indigo-400 leading-none mt-1">{endTime}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm">{appt.patient_name}</h4>
                          {getStatusBadge(appt.status)}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {appt.service_name} • <span className="font-medium text-slate-700">{appt.professional_name}</span>
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                          {appt.modality === 'online' ? (
                            <span className="flex items-center gap-1 text-teal-600"><Video className="w-3 h-3" /> Online</span>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-500"><MapPin className="w-3 h-3" /> Presencial</span>
                          )}
                          <span>• Tel: {appt.patient_phone}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Status Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                      {appt.status === 'scheduled' && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'confirmed')}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors"
                        >
                          Confirmar
                        </button>
                      )}
                      {appt.status === 'confirmed' && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'in_progress')}
                          className="px-2.5 py-1 text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg transition-colors"
                        >
                          Iniciar
                        </button>
                      )}
                      {(appt.status === 'in_progress' || appt.status === 'confirmed') && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'completed')}
                          className="px-2.5 py-1 text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 rounded-lg transition-colors shadow-xs"
                        >
                          Concluir
                        </button>
                      )}
                      {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                        <button
                          onClick={() => handleUpdateStatus(appt.id, 'no_show')}
                          className="px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Marcar falta"
                        >
                          Faltou
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Monthly Trend & Quick Stats (1/3 width) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-lg mb-1">Evolução Mensal</h3>
            <p className="text-xs text-slate-500 mb-4">Volume de atendimentos nos últimos meses.</p>

            {/* Visual Bar Chart */}
            <div className="space-y-3">
              {(metrics?.chart || []).map((item: any, idx: number) => {
                const max = Math.max(...(metrics?.chart || []).map((c: any) => c.appointments), 10);
                const percent = Math.min(100, Math.round((item.appointments / max) * 100));

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <span className="capitalize">{item.month}</span>
                      <span>{item.appointments} atendimentos</span>
                    </div>
                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 bg-slate-50 p-4 rounded-xl">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Resumo Operacional</h4>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Profissionais Ativos:</span>
                <span className="font-bold text-slate-900">{metrics?.totals?.active_professionals || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Serviços Configurados:</span>
                <span className="font-bold text-slate-900">{metrics?.totals?.active_services || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Novos {clientTermLabel}s (mês):</span>
                <span className="font-bold text-indigo-600">+{metrics?.monthly?.newPatients || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
