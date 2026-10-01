import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';

export default function SystemIntegrityView() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    ApiClient.get(`/v1/admin/integrity?page=${page}`).then(result => { if (active) setData(result); })
      .catch(() => { if (active) setError('Não foi possível consultar a integridade. Tente atualizar.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, revision]);
  const service = (key: string) => data?.services.find((item: any) => item.service === key);
  const state = (item: any) => !item?.attempts ? 'Sem dados' : item.errors ? 'Erro' : item.failures ? 'Atenção' : 'Saudável';
  const time = (value?: string) => value ? new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : 'Sem registro';
  return <section className="space-y-5" aria-label="Integridade do Sistema">
    <header className="flex items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold text-slate-900">Integridade do Sistema</h2><p className="text-xs text-slate-500">Últimas 24 horas · eventos técnicos agregados · retenção de sete dias</p></div>
      <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="px-4 py-2 bg-white border rounded-xl text-sm">{loading ? 'Carregando…' : 'Atualizar'}</button>
    </header>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {data && <>
      <div className="grid sm:grid-cols-2 xl:grid-cols-6 gap-3">
        {[['API', state(service('api'))], ['Autosave', state(service('autosave'))], ['Uploads', state(service('uploads'))],
          ['WhatsApp', data.whatsapp.some((r: any) => r.status === 'failed' && r.count) ? 'Erro' : data.whatsapp.some((r: any) => r.status === 'pending' && r.count) ? 'Atenção' : data.whatsapp.length ? 'Saudável' : 'Sem dados'],
          ['Jobs', data.jobs.pendingNotifications + data.jobs.pendingClinicDeletions ? 'Atenção' : 'Sem pendências'],
          ['Clínicas afetadas', String(data.affectedClinics)]].map(([label, value]) => <article key={label} className="bg-white rounded-2xl border p-4"><h3 className="text-xs font-bold text-slate-500">{label}</h3><p className={`mt-2 font-bold ${value === 'Erro' ? 'text-red-700' : value === 'Atenção' ? 'text-amber-700' : 'text-slate-800'}`}>{value}</p></article>)}
      </div>
      <article className="bg-white border rounded-2xl p-5 overflow-x-auto">
        <h3 className="font-bold mb-3">Erros recentes</h3>
        <table className="w-full text-xs text-left"><thead><tr>{['Data/hora', 'Serviço', 'Endpoint', 'Tipo', 'Clínica (ID)', 'Mensagem', 'Ocorrências'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>
          {data.recent.map((row: any, i: number) => <tr key={i} className="border-t"><td className="p-2">{time(row.last_seen)}</td><td>{row.event_type}</td><td className="break-all">{row.endpoint}</td><td>{row.severity}</td><td>{row.tenant_id || 'Global'}</td><td>{row.message}</td><td>{row.occurrences}</td></tr>)}
        </tbody></table>
        {!data.recent.length && <p className="text-sm text-slate-500 py-3">Nenhuma falha registrada neste período.</p>}
        <div className="flex justify-end gap-4 mt-4 text-xs"><button disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} · {data.pagination.total} grupos</span><button disabled={page * 25 >= data.pagination.total || loading} onClick={() => setPage(value => value + 1)}>Próxima</button></div>
      </article>
      <div className="grid lg:grid-cols-2 gap-4">
        <article className="bg-white border rounded-2xl p-5"><h3 className="font-bold mb-3">Erros mais frequentes</h3>{data.frequent.map((row: any, i: number) => <p key={i} className="text-xs py-2 border-b break-all">{row.endpoint} · HTTP {row.status_code} · {row.occurrences} ocorrências · {row.clinics} clínicas · {time(row.last_seen)}</p>)}</article>
        <article className="bg-white border rounded-2xl p-5"><h3 className="font-bold mb-3">Autosave por módulo</h3>{data.autosave.map((row: any) => <p key={row.module} className="text-xs py-2">{row.module}: {row.attempts} tentativas · {row.successes} sucessos · {row.failures} falhas · {time(row.last_seen)}</p>)}{!data.autosave.length && <p className="text-xs text-slate-500">Sem eventos de autosave no período.</p>}</article>
        <article className="bg-white border rounded-2xl p-5"><h3 className="font-bold mb-3">WhatsApp e filas existentes</h3>{data.whatsapp.map((row: any) => <p key={row.status} className="text-xs py-1">{({ sent: 'Enviadas', failed: 'Falhas', pending: 'Pendentes' } as Record<string, string>)[row.status] || row.status}: {row.count} · {time(row.last_seen)}</p>)}<p className="text-xs mt-3">Notificações pendentes: {data.jobs.pendingNotifications} · Exclusões pendentes: {data.jobs.pendingClinicDeletions}</p><p className="text-xs text-slate-500 mt-2">{data.jobs.note}</p></article>
        <article className="bg-white border rounded-2xl p-5"><h3 className="font-bold mb-3">Deploy e processo</h3><p className="text-xs">Ambiente: {data.deployment.environment}</p><p className="text-xs mt-2">Commit: {data.deployment.commit || 'Não disponibilizado'}</p><p className="text-xs mt-2">Processo iniciado: {time(data.deployment.processStartedAt)}</p><p className="text-xs text-slate-500 mt-2">{data.deployment.status}</p></article>
      </div>
    </>}
  </section>;
}
