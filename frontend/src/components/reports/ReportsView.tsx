import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  BarChart3,
  Download,
  Calendar,
  Users,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  FileSpreadsheet,
  Activity
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [financialData, setFinancialData] = useState<any>(null);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const [att, fin] = await Promise.all([
        ApiClient.get<any>('/v1/reports/attendance'),
        ApiClient.get<any>('/v1/reports/financial')
      ]);
      setAttendanceData(att);
      setFinancialData(fin);
    } catch (err: any) {
      showToast('Erro ao carregar relatórios', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleDownloadCsv = async (type: 'appointments' | 'payments') => {
    try {
      const csvText = await ApiClient.get<string>(`/v1/reports/export-csv?type=${type}`);
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-${type}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Relatório de ${type} baixado com sucesso!`, 'success');
    } catch (err) {
      showToast('Erro ao exportar CSV', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Relatórios & Métricas Analíticas</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Estatísticas detalhadas de ocupação por profissional e faturamento por forma de pagamento.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownloadCsv('appointments')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Exportar Atendimentos (CSV)
          </button>
          <button
            onClick={() => handleDownloadCsv('payments')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all border border-indigo-200"
          >
            <Download className="w-4 h-4 text-indigo-600" /> Exportar Financeiro (CSV)
          </button>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Atendimentos por Profissional */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" /> Desempenho por Profissional
          </h3>

          <div className="space-y-3 text-xs">
            {(attendanceData?.byProfessional || []).map((prof: any, i: number) => (
              <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <div className="flex justify-between items-center font-bold text-slate-900 text-sm">
                  <span>{prof.professional_name}</span>
                  <span className="text-indigo-600">{prof.total} atendimentos</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500 pt-1">
                  <div>Concluídos: <strong className="text-teal-600">{prof.completed || 0}</strong></div>
                  <div>Faltas: <strong className="text-amber-600">{prof.no_show || 0}</strong></div>
                  <div>Cancelados: <strong className="text-rose-600">{prof.cancelled || 0}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Faturamento por Forma de Pagamento */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-teal-600" /> Faturamento por Forma de Pagamento
          </h3>

          <div className="space-y-3 text-xs">
            {(financialData?.byMethod || []).map((m: any, i: number) => (
              <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 uppercase text-xs">{m.payment_method}</span>
                  <span className="text-slate-400 text-[11px] block mt-0.5">{m.count} transação(ões)</span>
                </div>
                <span className="font-extrabold text-slate-900 text-base">
                  {Number(m.total_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Produção por Módulo Clínico Especializado */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 lg:col-span-2">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" /> Produção por Especialidade / Módulo Clínico
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {(attendanceData?.byModule || []).length > 0 ? (
              (attendanceData?.byModule || []).map((mod: any, i: number) => (
                <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">{mod.module_type || 'Geral'}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black text-slate-900">{mod.total}</span>
                    <span className="text-[11px] text-slate-500 font-medium">prontuários</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-4 text-center text-slate-400">
                Nenhum prontuário especializado registrado no período.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
