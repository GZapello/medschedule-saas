import React, { useCallback, useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { CreditCard, Users, CheckCircle2, AlertCircle, ArrowUpRight } from 'lucide-react';

const money=(v:number)=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=(v:string)=>v?new Date(v.slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const statuses:Record<string,string>={ACTIVE:'Ativo',PENDING_PAYMENT:'Aguardando pagamento',PAST_DUE:'Pagamento pendente',SUSPENDED:'Suspenso',CANCELED:'Cancelado',NOT_SUBSCRIBED:'Escolha seu plano',CONFIRMED:'Pago',RECEIVED:'Pago',OVERDUE:'Vencido',PENDING:'Pendente',REFUNDED:'Estornado',DELETED:'Removido'};
export function useBillingSummary(includeGlobal=false) {
  const {currentUser,currentTenant}=useAuth();
  const [summary,setSummary]=useState<any>(null);
  const [error,setError]=useState('');
  const reload=useCallback(async()=>{
    if(!currentUser || currentUser.role==='superadmin' && !includeGlobal) {setSummary(null);return;}
    try {setSummary(await ApiClient.get('/v1/subscriptions/current'));setError('');}
    catch(e:any){setError(e.message || 'Não foi possível consultar sua assinatura.');}
  },[currentUser?.id,currentTenant?.id,includeGlobal]);
  useEffect(()=>{setSummary(null);void reload();const timer=setInterval(()=>{if(!document.hidden) void reload();},15000);
    const event=()=>void reload();window.addEventListener('zemda-billing-refresh',event);
    return()=>{clearInterval(timer);window.removeEventListener('zemda-billing-refresh',event);};},[reload]);
  return {summary,error,reload};
}
export const BillingView:React.FC<{publicPage?:boolean;callback?:string;onBack?:()=>void}>=({publicPage=false,callback,onBack})=>{
  const {currentUser,logout,reloadSession}=useAuth();
  const {summary,error:summaryError,reload}=useBillingSummary(true);
  const [plans,setPlans]=useState<any[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [showPlans,setShowPlans]=useState(publicPage),[cancelOpen,setCancelOpen]=useState(false),[confirmation,setConfirmation]=useState(''),[reason,setReason]=useState('');
  const [historyOpen,setHistoryOpen]=useState(false);
  const [profileOpen,setProfileOpen]=useState(false),[profile,setProfile]=useState({name:'',cpfCnpj:'',email:'',phone:''});
  const canManage=summary?.canManage ?? (!currentUser || ['superadmin','clinic_admin'].includes(currentUser.role) || (currentUser as any).permissions?.includes('manage_subscription'));
  useEffect(()=>{ApiClient.get<any[]>('/v1/plans').then(setPlans).catch((e:any)=>setError(e.message));},[]);
  useEffect(()=>{if(currentUser && canManage) ApiClient.get<any>('/v1/subscriptions/profile').then(p=>{setProfile({name:p.name || '',cpfCnpj:p.cpfCnpj || '',email:p.email || '',phone:p.phone || ''});if(!p.cpfCnpj)setProfileOpen(true);}).catch(()=>{});},[currentUser?.id,canManage]);
  const refresh=async()=>{await reload();window.dispatchEvent(new Event('zemda-billing-refresh'));};
  const choose=async(code:string)=>{
    if(!currentUser){window.location.assign('/assinatura?plan='+encodeURIComponent(code));return;}
    if(busy)return;setBusy(true);setError('');setNotice('');
    try {
      if(summary?.managed && summary.status==='ACTIVE') {
        const result=await ApiClient.post<any>('/v1/subscriptions/change-plan',{planCode:code});setNotice(result.message);await refresh();setShowPlans(false);
      } else {
        const result=await ApiClient.post<{url:string}>('/v1/subscriptions/checkout',{planCode:code});
        // Backend validates and returns only an Asaas HTTPS URL.
        window.location.assign(result.url);
      }
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  };
  const cancel=async(e:React.FormEvent)=>{
    e.preventDefault();if(busy)return;setBusy(true);setError('');
    try {const result=await ApiClient.post<any>('/v1/subscriptions/cancel',{confirmation,reason});setNotice(result.message);setCancelOpen(false);setConfirmation('');setReason('');await refresh();}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  };
  const saveProfile=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const r=await ApiClient.put<any>('/v1/subscriptions/profile',profile);setNotice(r.message);setProfileOpen(false);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  const pending=summary?.status==='PAST_DUE';
  return <section className="max-w-6xl mx-auto space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl bg-slate-900 text-white p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4">
      <div><div className="text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2">Zemda · Assinaturas</div><h1 className="text-2xl font-bold">Assinatura e Plano</h1><p className="text-slate-300 text-sm mt-2">Escolha o tamanho da sua equipe. Seus módulos continuam disponíveis conforme sua profissão.</p></div>
      <CreditCard className="w-10 h-10 text-indigo-300" />
    </header>
    {callback && <div className="rounded-2xl border bg-white p-5" role="status">
      <h2 className="font-bold">{callback==='sucesso'?'Pagamento enviado para confirmação.':callback==='cancelada'?'Você retornou do checkout.':'O prazo deste checkout terminou.'}</h2>
      <p className="text-sm text-slate-600 mt-1">{callback==='sucesso'?'Estamos confirmando sua assinatura. Esta página será atualizada após a confirmação do Asaas.':'O retorno do checkout não ativa nenhum plano. Consulte o status abaixo antes de tentar novamente.'}</p>
    </div>}
    {(error || summaryError) && <p className="rounded-xl p-4 bg-red-50 text-red-800" role="alert">{error || summaryError} <button onClick={()=>void refresh()} className="underline">Atualizar</button></p>}
    {notice && <p className="rounded-xl p-4 bg-emerald-50 text-emerald-800" role="status">{notice}</p>}
    {summary?.status==='ACTIVE' && callback==='sucesso' && <div className="p-4 rounded-xl bg-emerald-50 text-emerald-800 flex gap-3 items-center"><CheckCircle2 />Assinatura ativada com sucesso.<button className="underline ml-auto" onClick={async()=>{await reloadSession();window.location.assign('/');}}>Acessar Zemda</button></div>}
    {pending && <div className="bg-amber-50 text-amber-900 p-4 rounded-xl flex gap-3"><AlertCircle className="shrink-0"/><p>Há uma pendência na sua assinatura. Regularize o pagamento para evitar a suspensão do acesso. Prazo: {date(summary.gracePeriodUntil)}.</p></div>}
    {summary && <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
      <p className="text-sm text-slate-600">Clínica: <strong>{summary.clinicName}</strong>{summary.environment==='sandbox' && <span className="ml-3 text-amber-700">Ambiente de teste · Sandbox</span>}</p>
      <div className="grid sm:grid-cols-4 gap-5"><div><p className="text-xs text-slate-500">Plano atual</p><h2 className="font-bold text-lg">{summary.plan?.name || 'Sem assinatura Asaas'}</h2><p>{summary.plan?money(summary.plan.monthly_price)+'/mês':'Escolha um dos planos abaixo'}</p></div>
        <div><p className="text-xs text-slate-500">Status</p><p className="font-bold">{statuses[summary.status] || summary.status}</p></div>
        <div><p className="text-xs text-slate-500">Usuários ativos</p><p className="font-bold">{summary.activeUsers} / {summary.maxUsers ?? '—'}</p></div>
        <div><p className="text-xs text-slate-500">Próxima cobrança</p><p className="font-bold">{summary.status==='CANCELED'?'Renovação cancelada':date(summary.nextDueDate)}</p></div></div>
      {summary.pendingPlan && <p className="text-indigo-700 bg-indigo-50 rounded-xl p-3">Mudança para {summary.pendingPlan.name} no ciclo de {date(summary.changeEffectiveOn)}, após confirmação do pagamento.</p>}
      {summary.status==='CANCELED' && summary.currentPeriodEnd && <p>Acesso pago até {date(summary.currentPeriodEnd)}. Seus dados serão preservados.</p>}
      {canManage && <div className="flex flex-wrap gap-3"><button className="px-4 py-2 bg-indigo-600 text-white rounded-xl" onClick={()=>setShowPlans(v=>!v)}>Alterar plano</button>
        <button className="px-4 py-2 border rounded-xl" onClick={()=>setProfileOpen(v=>!v)}>Dados de cobrança</button>
        {summary.managed && <button className="px-4 py-2 border rounded-xl" onClick={()=>setCancelOpen(true)}>Gerenciar assinatura</button>}
        <button className="px-4 py-2 border rounded-xl" onClick={()=>setHistoryOpen(v=>!v)}>Histórico de cobranças</button></div>}
      {!canManage && <p className="text-slate-600 text-sm">Solicite ao responsável da clínica a regularização ou alteração do plano.</p>}
    </div>}
    {currentUser && canManage && profileOpen && <form onSubmit={saveProfile} className="bg-white border rounded-2xl p-6 space-y-4"><h2 className="font-bold">Dados de cobrança</h2><p className="text-sm text-slate-600">Esses dados identificam o pagador no Asaas. Os dados do cartão são informados somente no checkout hospedado.</p><div className="grid sm:grid-cols-2 gap-4">
      {([['name','Nome do pagador'],['cpfCnpj','CPF/CNPJ'],['email','E-mail'],['phone','Telefone']] as const).map(([key,label])=><label key={key} className="text-sm">{label}<input required={key!=='phone'} type={key==='email'?'email':'text'} maxLength={key==='name'?160:key==='email'?200:30} value={profile[key]} onChange={e=>setProfile({...profile,[key]:e.target.value})} className="w-full block border rounded-lg p-2 mt-1" /></label>)}</div><button disabled={busy} className="bg-indigo-600 text-white px-4 py-2 rounded-xl">Salvar dados de cobrança</button></form>}
    {canManage && (showPlans || !summary?.managed || summary?.status==='PENDING_PAYMENT') && <div className="grid md:grid-cols-3 gap-4">
      {plans.map(plan=><article key={plan.code} className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-5">
        <h2 className="text-xl font-bold">{plan.name}</h2><p className="flex gap-2 items-center text-slate-600"><Users className="w-5 h-5"/>{plan.max_users===1?'1 usuário':`Até ${plan.max_users} usuários`}</p>
        <p className="text-3xl font-bold">{money(plan.monthly_price)}<span className="text-sm text-slate-500 font-normal">/mês</span></p>
        <p className="text-sm text-slate-600">Módulos profissionais conforme sua área de atuação.</p>
        <button disabled={busy || summary?.plan?.code===plan.code && summary?.status==='ACTIVE'} onClick={()=>void choose(plan.code)} className="mt-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold p-3 rounded-xl disabled:opacity-50">{busy?'Aguarde…':summary?.managed && summary.status==='ACTIVE'?'Programar mudança':'Assinar'}</button>
      </article>)}
    </div>}
    {historyOpen && summary && <div className="bg-white border rounded-2xl p-5 overflow-x-auto"><h2 className="font-bold mb-4">Histórico de cobranças</h2><table className="w-full text-sm text-left"><thead><tr><th className="p-2">Data</th><th>Valor</th><th>Forma</th><th>Status</th><th>Pagamento</th></tr></thead><tbody>
      {summary.payments.map((p:any)=><tr key={p.id} className="border-t"><td className="p-3">{date(p.due_date)}</td><td>{money(p.amount)}</td><td>{p.billing_type==='CREDIT_CARD'?'Cartão':p.billing_type}</td><td>{statuses[p.status] || p.status}</td><td>{p.invoice_url && <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" className="text-indigo-700 inline-flex gap-1">Abrir cobrança<ArrowUpRight className="w-4 h-4"/></a>}</td></tr>)}
    </tbody></table>{!summary.payments.length && <p className="text-slate-500 p-4">Nenhuma cobrança registrada.</p>}</div>}
    {summary && ['PAST_DUE','SUSPENDED'].includes(summary.status) && canManage && <button onClick={()=>setHistoryOpen(true)} className="bg-indigo-600 text-white p-3 rounded-xl">Regularizar pagamento</button>}
    {cancelOpen && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><form role="dialog" aria-modal="true" aria-label="Gerenciar assinatura" onSubmit={cancel} className="bg-white p-6 rounded-2xl space-y-4 max-w-lg w-full">
      <h2 className="font-bold text-lg">Cancelar renovação</h2><p>O cancelamento encerra as próximas cobranças. Os dados da clínica serão preservados.</p>
      <label className="block">Motivo (opcional)<textarea maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} className="w-full border p-2 rounded-lg" /></label>
      <label className="block">Digite CANCELAR<input autoFocus required value={confirmation} onChange={e=>setConfirmation(e.target.value)} className="w-full border p-2 rounded-lg" /></label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex gap-3 justify-end"><button type="button" disabled={busy} onClick={()=>setCancelOpen(false)} className="border px-3 py-2 rounded-lg">Voltar</button><button disabled={busy || confirmation!=='CANCELAR'} className="bg-red-700 text-white px-3 py-2 rounded-lg disabled:opacity-50">{busy?'Processando…':'Cancelar renovação'}</button></div>
    </form></div>}
    <footer className="flex gap-4 text-sm text-slate-600">{onBack && <button onClick={onBack} className="underline">Voltar ao Zemda</button>}{currentUser?<button onClick={logout} className="underline">Sair da conta</button>:<a href="/assinatura" className="underline">Já tenho conta · Entrar</a>}</footer>
  </section>;
};

export const BillingBanner:React.FC<{summary:any}>=({summary})=>{
  if(!summary || !['PAST_DUE','SUSPENDED'].includes(summary.status)) return null;
  return <div className="m-4 p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl flex flex-wrap gap-3 items-center" role="status"><AlertCircle className="w-5 h-5"/><p className="flex-1">Há uma pendência na sua assinatura. Regularize o pagamento para evitar a suspensão do acesso.</p><button onClick={()=>window.dispatchEvent(new CustomEvent('zemda-navigate',{detail:{view:'subscription'}}))} className="font-bold underline">Assinatura e Plano</button></div>;
};
