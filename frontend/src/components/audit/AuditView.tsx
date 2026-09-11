import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { ShieldCheck, Search, Clock, User } from 'lucide-react';

export const AuditView: React.FC = () => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        const data = await ApiClient.get<any[]>('/v1/audit?limit=50');
        setLogs(data);
      } catch (err: any) {
        showToast('Erro ao carregar logs de auditoria', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Trilha de Auditoria & Segurança LGPD</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Registro imutável de todas as ações operacionais, alterações de dados e acessos a prontuários.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-6 py-3.5">Data/Hora</th>
                <th className="px-6 py-3.5">Usuário Responsável</th>
                <th className="px-6 py-3.5">Ação Executada</th>
                <th className="px-6 py-3.5">Módulo / Entidade</th>
                <th className="px-6 py-3.5">IP de Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Nenhum registro de auditoria encontrado.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-slate-500 whitespace-nowrap">
                      {log.created_at}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="font-bold text-slate-900">{log.user_name || 'Sistema'}</div>
                      <div className="text-[11px] text-slate-400">{log.user_email || 'automático'}</div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-semibold text-slate-700 capitalize">
                      {log.entity}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-slate-400 text-[11px]">
                      {log.ip_address}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
