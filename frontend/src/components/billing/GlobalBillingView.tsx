import React,{useEffect,useState} from 'react';
import {ApiClient} from '../../api/client';
const labels:Record<string,string>={ACTIVE:'Ativas',PENDING_PAYMENT:'Pendentes',PAST_DUE:'Inadimplentes',SUSPENDED:'Suspensas',CANCELED:'Canceladas'};
export const GlobalBillingView:React.FC<{integration?:boolean}>=({integration=false})=>{
  const [data,setData]=useState<any>(null),[connection,setConnection]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [filters,setFilters]=useState({clinic:'',plan:'',status:'',from:'',to:''});
  const load=async()=>{setBusy(true);setError('');try{if(integration)setConnection(await ApiClient.get('/v1/admin/integrations/asaas/status'));else setData(await ApiClient.get('/v1/admin/subscriptions?'+new URLSearchParams(filters)));}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  useEffect(()=>{void load();},[integration]);
  const test=async()=>{setBusy(true);setError('');try{setConnection(await ApiClient.post('/v1/admin/integrations/asaas/test',{}));}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  return <div className="space-y-5">
    {error && <p role="alert" className="text-red-700 bg-red-50 p-4 rounded-xl">{error}</p>}
    {integration?<div className="bg-white rounded-2xl border p-6 space-y-4"><h2 className="text-xl font-bold">Integrações · Asaas</h2>
      <dl className="grid sm:grid-cols-3 gap-4"><div><dt className="text-sm text-slate-500">Ambiente</dt><dd className="font-bold">{connection?.environment==='production'?'Production':'Sandbox'}</dd></div><div><dt className="text-sm text-slate-500">Status</dt><dd className="font-bold">{connection?.connected===true?'Conectado':connection?.connected===false?'Erro':'Ainda não testado'}</dd></div><div><dt className="text-sm text-slate-500">Último teste</dt><dd>{connection?.lastTest?new Date(connection.lastTest).toLocaleString('pt-BR'):'—'}</dd></div></dl>
      {connection?.error && <p className="text-red-700">{connection.error}</p>}<button disabled={busy} onClick={()=>void test()} className="bg-indigo-600 text-white rounded-xl px-4 py-2 disabled:opacity-50">{busy?'Testando…':'Testar conexão'}</button>
    </div>:<>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['TOTAL','Total',data?.total || 0],...Object.entries(labels).map(([key,label])=>[key,label,data?.counts.find((c:any)=>c.status===key)?.total || 0]),['MRR','MRR ativo',Number(data?.mrr || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})]].map(([key,label,value])=><div key={key} className="bg-white rounded-2xl p-5 border"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>)}</div>
      <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-6">{['SOLO','TEAM','CLINIC'].map(code=><span key={code}>{code}: <strong>{data?.byPlan.find((p:any)=>p.code===code)?.total || 0}</strong></span>)}<span>Eventos aguardando conciliação: <strong>{data?.pendingEvents || 0}</strong></span></div>
      <form onSubmit={e=>{e.preventDefault();void load();}} className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <label className="text-sm">Clínica<input value={filters.clinic} onChange={e=>setFilters({...filters,clinic:e.target.value})} className="border rounded-lg p-2 block"/></label>
        <label className="text-sm">Plano<select value={filters.plan} onChange={e=>setFilters({...filters,plan:e.target.value})} className="border rounded-lg p-2 block"><option value="">Todos</option>{['SOLO','TEAM','CLINIC'].map(p=><option key={p}>{p}</option>)}</select></label>
        <label className="text-sm">Status<select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})} className="border rounded-lg p-2 block"><option value="">Todos</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm">De<input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})} className="border rounded-lg p-2 block"/></label><label className="text-sm">Até<input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})} className="border rounded-lg p-2 block"/></label>
        <button disabled={busy} className="bg-indigo-600 text-white rounded-lg px-4 py-2 self-end">{busy?'Carregando…':'Filtrar'}</button>
      </form>
      <div className="bg-white rounded-2xl border p-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Clínica','Plano','Status','Valor mensal','Próxima cobrança','Ambiente'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data?.rows.map((s:any)=><tr key={s.id} className="border-t"><td className="p-3 font-bold">{s.clinic_name}</td><td>{s.plan_name}</td><td>{labels[s.status] || s.status}</td><td>{Number(s.monthly_price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td>{s.next_due_date || '—'}</td><td>{s.gateway_environment}</td></tr>)}</tbody></table>{data?.rows.length===0 && <p className="p-5 text-slate-500">Nenhuma assinatura encontrada.</p>}</div>
    </>}
  </div>;
};
