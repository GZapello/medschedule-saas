import React, { useCallback, useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { CreditCard, Users, CheckCircle2, AlertCircle, ArrowUpRight, ArrowLeft, Sparkles } from 'lucide-react';

const money=(v:number)=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=(v:string)=>v?new Date(v.slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const emptyProfile={name:'',cpfCnpj:'',email:'',phone:'',postalCode:'',address:'',addressNumber:'',province:'',complement:''};
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
export const BillingView:React.FC<{publicPage?:boolean;callback?:string}>=({publicPage=false,callback})=>{
  const {currentUser,logout,reloadSession}=useAuth();
  const {summary,error:summaryError,reload}=useBillingSummary(true);
  const [plans,setPlans]=useState<any[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [showPlans,setShowPlans]=useState(publicPage),[cancelOpen,setCancelOpen]=useState(false),[confirmation,setConfirmation]=useState(''),[reason,setReason]=useState('');
  const [historyOpen,setHistoryOpen]=useState(false);
  const [profileOpen,setProfileOpen]=useState(false),[profile,setProfile]=useState(emptyProfile);
  const canManage=summary?.canManage ?? (!currentUser || ['superadmin','clinic_admin'].includes(currentUser.role) || (currentUser as any).permissions?.includes('manage_subscription'));
  useEffect(()=>{ApiClient.get<any[]>('/v1/plans').then(setPlans).catch((e:any)=>setError(e.message));},[]);
  useEffect(()=>{if(currentUser && canManage) ApiClient.get<any>('/v1/subscriptions/profile').then(p=>{setProfile(Object.fromEntries(Object.keys(emptyProfile).map(k=>[k,p[k] || ''])) as typeof emptyProfile);if(!p.cpfCnpj || !p.postalCode || !p.address || !p.addressNumber || !p.province)setProfileOpen(true);}).catch(()=>{});},[currentUser?.id,canManage]);
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
    }catch(e:any){setError(e.message);if(['BILLING_ADDRESS_REQUIRED','ASAAS_VALIDATION_ERROR'].includes(e.code))setProfileOpen(true);}finally{setBusy(false);}
  };
  const cancel=async(e:React.FormEvent)=>{
    e.preventDefault();if(busy)return;setBusy(true);setError('');
    try {const result=await ApiClient.post<any>('/v1/subscriptions/cancel',{confirmation,reason});setNotice(result.message);setCancelOpen(false);setConfirmation('');setReason('');await refresh();}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  };
  const saveProfile=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const r=await ApiClient.put<any>('/v1/subscriptions/profile',profile);setNotice(r.message);setProfileOpen(false);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  const pending=summary?.status==='PAST_DUE';

  const handleBack = () => {
    sessionStorage.setItem('zemda-billing-return-home', '1');
    window.location.assign('https://zemda.com.br');
  };

  return <section className="max-w-6xl mx-auto space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition shadow-xs cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4 text-slate-500" />
        Voltar ao Zemda
      </button>
      {currentUser && (
        <span className="text-xs text-slate-500 font-medium">
          Conectado como <strong className="text-slate-700">{currentUser.name || currentUser.email}</strong>
        </span>
      )}
    </div>

    <header className="rounded-3xl bg-gradient-to-r from-teal-50 via-emerald-50/40 to-teal-50 border border-teal-200/80 p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4 shadow-xs">
      <div>
        <div className="text-teal-800 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-teal-600"></span>
          Zemda · Assinaturas & Planos
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Assinatura e Plano</h1>
        <p className="text-slate-600 text-sm mt-2 max-w-xl">
          Escolha o tamanho ideal para sua clínica ou consultório. Seus módulos especializados e ferramentas clínicas continuam sempre disponíveis.
        </p>
      </div>
      <div className="w-14 h-14 rounded-2xl bg-white border border-teal-100 shadow-xs flex items-center justify-center text-teal-600">
        <CreditCard className="w-7 h-7" />
      </div>
    </header>
    {callback && <div className="rounded-2xl border bg-white p-5" role="status">
      <h2 className="font-bold">{callback==='sucesso'?'Pagamento enviado para confirmação.':callback==='cancelada'?'Você retornou do checkout.':'O prazo deste checkout terminou.'}</h2>
      <p className="text-sm text-slate-600 mt-1">{callback==='sucesso'?'Estamos confirmando sua assinatura. Esta página será atualizada após a confirmação do Asaas.':'O retorno do checkout não ativa nenhum plano. Consulte o status abaixo antes de tentar novamente.'}</p>
    </div>}
    {(error || summaryError) && <p className="rounded-xl p-4 bg-red-50 text-red-800" role="alert">{error || summaryError} <button onClick={()=>void refresh()} className="underline">Atualizar</button></p>}
    {notice && <p className="rounded-xl p-4 bg-emerald-50 text-emerald-800" role="status">{notice}</p>}
    {summary?.status==='ACTIVE' && callback==='sucesso' && <div className="p-4 rounded-xl bg-emerald-50 text-emerald-800 flex gap-3 items-center"><CheckCircle2 />Assinatura ativada com sucesso.<button className="underline ml-auto" onClick={async()=>{await reloadSession();window.location.assign('/');}}>Acessar Zemda</button></div>}
    {pending && <div className="bg-amber-50 text-amber-900 p-4 rounded-xl flex gap-3"><AlertCircle className="shrink-0"/><p>Há uma pendência na sua assinatura. Regularize o pagamento para evitar a suspensão do acesso. Prazo: {date(summary.gracePeriodUntil)}.</p></div>}
    {summary && <div className="bg-white border border-slate-200/80 shadow-xs rounded-3xl p-6 sm:p-8 space-y-6">
      <p className="text-sm text-slate-600">Clínica: <strong>{summary.clinicName}</strong>{summary.environment==='sandbox' && <span className="ml-3 text-amber-700">Ambiente de teste · Sandbox</span>}</p>
      <div className="grid sm:grid-cols-4 gap-5"><div><p className="text-xs text-slate-500">Plano atual</p><h2 className="font-bold text-lg text-slate-900">{summary.plan?.name || 'Sem assinatura Asaas'}</h2><p className="text-teal-700 font-semibold">{summary.plan?money(summary.plan.monthly_price)+'/mês':'Escolha um dos planos abaixo'}</p></div>
        <div><p className="text-xs text-slate-500">Status</p><p className="font-bold text-slate-800">{statuses[summary.status] || summary.status}</p></div>
        <div><p className="text-xs text-slate-500">Usuários ativos</p><p className="font-bold text-slate-800">{summary.activeUsers} / {summary.maxUsers ?? '—'}</p></div>
        <div><p className="text-xs text-slate-500">Próxima cobrança</p><p className="font-bold text-slate-800">{summary.status==='CANCELED'?'Renovação cancelada':date(summary.nextDueDate)}</p></div></div>
      {summary.pendingPlan && <p className="text-teal-800 bg-teal-50 border border-teal-200/60 rounded-xl p-3 text-sm">Mudança para {summary.pendingPlan.name} no ciclo de {date(summary.changeEffectiveOn)}, após confirmação do pagamento.</p>}
      {summary.status==='CANCELED' && summary.currentPeriodEnd && <p>Acesso pago até {date(summary.currentPeriodEnd)}. Seus dados serão preservados.</p>}
      {canManage && <div className="flex flex-wrap gap-3"><button className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-all" onClick={()=>setShowPlans(v=>!v)}>Alterar plano</button>
        <button className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-all" onClick={()=>setProfileOpen(v=>!v)}>Dados de cobrança</button>
        {summary.managed && <button className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-all" onClick={()=>setCancelOpen(true)}>Gerenciar assinatura</button>}
        <button className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-all" onClick={()=>setHistoryOpen(v=>!v)}>Histórico de cobranças</button></div>}
      {!canManage && <p className="text-slate-600 text-sm">Solicite ao responsável da clínica a regularização ou alteração do plano.</p>}
    </div>}
    {currentUser && canManage && profileOpen && <form onSubmit={saveProfile} className="bg-white border border-slate-200/80 shadow-xs rounded-3xl p-6 sm:p-8 space-y-4"><h2 className="font-bold text-slate-900">Dados de cobrança</h2><p className="text-sm text-slate-600">Esses dados identificam o pagador no Asaas. Os dados do cartão são informados somente no checkout hospedado.</p><div className="grid sm:grid-cols-2 gap-4">
      {([['name','Nome do pagador'],['cpfCnpj','CPF/CNPJ'],['email','E-mail'],['phone','Telefone'],['postalCode','CEP'],['address','Logradouro'],['addressNumber','Número'],['province','Bairro'],['complement','Complemento (opcional)']] as const).map(([key,label])=><label key={key} className="text-xs font-semibold text-slate-700">{label}<input required={key!=='phone' && key!=='complement'} type={key==='email'?'email':'text'} maxLength={key==='email'?200:key==='postalCode'?9:['phone','cpfCnpj','addressNumber'].includes(key)?30:160} value={profile[key]} onChange={e=>setProfile({...profile,[key]:e.target.value})} className="w-full block border border-slate-200 rounded-xl p-2.5 mt-1 bg-slate-50 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden" /></label>)}</div><p className="text-xs text-slate-500">Informe o endereço do pagador. A cidade é identificada pelo Asaas a partir do CEP.</p><button disabled={busy} className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs cursor-pointer transition-all disabled:opacity-50">Salvar dados de cobrança</button></form>}
    {canManage && (showPlans || !summary?.managed || summary?.status==='PENDING_PAYMENT') && (
      <div className="space-y-6 pt-2">
        {/* Banner de recursos inclusos em todos os planos */}
        <div className="bg-white border border-teal-200/80 rounded-3xl p-6 sm:p-7 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-teal-700 block mb-0.5">
                Plataforma Completa
              </span>
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                Todos os planos do Zemda incluem:
              </h3>
            </div>
            <span className="px-3 py-1 bg-teal-50 text-teal-800 text-xs font-bold rounded-xl border border-teal-200/60">
              9 recursos essenciais inclusos
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-700 font-medium pt-1">
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Agenda Interativa</span></div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Prontuário eletrônico</span></div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Financeiro</span></div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Documentos</span></div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Estoque</span></div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Equipe e permissões</span></div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Agendamento online</span></div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Inteligência Artificial</span></div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>ZemdaBody</span></div>
          </div>

          <div className="p-3.5 bg-gradient-to-r from-teal-50 via-emerald-50/60 to-teal-50 rounded-2xl border border-teal-200/70 text-xs text-teal-950 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              <strong>Módulo Especializado Automático:</strong> Cada profissional recebe automaticamente seu módulo específico (<strong>ZemdaFono</strong>, <strong>ZemdaPsico</strong>, <strong>ZemdaTO</strong>, <strong>ZemdaNutri</strong>, <strong>ZemdaFisio</strong>, <strong>ZemdaPersonal</strong> ou <strong>ZemdaOdonto</strong>) de acordo com sua profissão cadastrada.
            </span>
          </div>
        </div>

        {/* Cards dos Planos */}
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map(plan=>{
            const isFeatured = (plan.code || '').toLowerCase().includes('equipe') || (plan.name || '').toLowerCase().includes('equipe');
            const userLimitLabel = plan.max_users === 1 ? '1 acesso' : `${plan.max_users} acessos`;
            return <article key={plan.code} className={`bg-white rounded-3xl p-6 sm:p-8 flex flex-col justify-between gap-6 transition-all relative ${
              isFeatured
                ? 'border-2 border-teal-500 shadow-xl shadow-teal-900/10 scale-[1.02] z-10'
                : 'border border-slate-200 shadow-xs hover:border-slate-300'
            }`}>
              {isFeatured && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-[11px] font-extrabold uppercase tracking-wider px-3.5 py-1 rounded-full shadow-xs">
                  Mais Escolhido
                </span>
              )}
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{plan.name}</h2>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 text-xs font-bold mt-2">
                    <Users className="w-3.5 h-3.5 text-teal-600"/>
                    <span>{userLimitLabel}</span>
                  </div>
                </div>
                <div>
                  <p className="text-3xl font-black text-slate-900 tracking-tight">
                    {money(plan.monthly_price)}
                    <span className="text-xs text-slate-500 font-normal"> /mês</span>
                  </p>
                  <p className="text-xs text-slate-600 mt-2">
                    {plan.max_users === 1 ? 'Para atendimento autônomo individual.' : plan.max_users <= 5 ? 'Para clínicas e consultórios com até 5 acessos.' : 'Para clínicas consolidadas com até 20 acessos.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>{userLimitLabel} no sistema</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Módulos clínicos especializados inclusos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>ZemdaBody liberado</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Agenda, Prontuário, Financeiro e IA</span>
                  </div>
                </div>
              </div>

              <button disabled={busy || summary?.plan?.code===plan.code && summary?.status==='ACTIVE'} onClick={()=>void choose(plan.code)} className={`w-full font-bold text-xs py-3 px-4 rounded-xl cursor-pointer transition-all disabled:opacity-50 ${
                isFeatured
                  ? 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-md shadow-teal-700/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
              }`}>{busy?'Aguarde…':summary?.managed && summary.status==='ACTIVE'?'Programar mudança':'Assinar agora'}</button>
            </article>;
          })}
        </div>
      </div>
    )}
    {historyOpen && summary && <div className="bg-white border border-slate-200/80 shadow-xs rounded-3xl p-6 overflow-x-auto"><h2 className="font-bold text-slate-900 mb-4">Histórico de cobranças</h2><table className="w-full text-xs text-left"><thead><tr className="border-b border-slate-100 text-slate-500"><th className="p-3">Data</th><th>Valor</th><th>Forma</th><th>Status</th><th>Pagamento</th></tr></thead><tbody>
      {summary.payments.map((p:any)=><tr key={p.id} className="border-b border-slate-100"><td className="p-3 text-slate-700 font-medium">{date(p.due_date)}</td><td className="font-semibold text-slate-900">{money(p.amount)}</td><td>{p.billing_type==='CREDIT_CARD'?'Cartão':p.billing_type}</td><td><span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">{statuses[p.status] || p.status}</span></td><td>{p.invoice_url && <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:text-teal-800 font-bold inline-flex items-center gap-1">Abrir cobrança<ArrowUpRight className="w-3.5 h-3.5"/></a>}</td></tr>)}
    </tbody></table>{!summary.payments.length && <p className="text-slate-500 p-4 text-xs">Nenhuma cobrança registrada.</p>}</div>}
    {summary && ['PAST_DUE','SUSPENDED'].includes(summary.status) && canManage && <button onClick={()=>setHistoryOpen(true)} className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-xs p-3 rounded-xl shadow-xs">Regularizar pagamento</button>}
    {cancelOpen && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"><form role="dialog" aria-modal="true" aria-label="Gerenciar assinatura" onSubmit={cancel} className="bg-white p-6 sm:p-8 rounded-3xl space-y-4 max-w-lg w-full shadow-2xl border border-slate-100">
      <h2 className="font-bold text-lg text-slate-900">Cancelar renovação</h2><p className="text-xs text-slate-600">O cancelamento encerra as próximas cobranças. Os dados da clínica serão preservados.</p>
      <label className="block text-xs font-semibold text-slate-700">Motivo (opcional)<textarea maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-slate-50 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden" /></label>
      <label className="block text-xs font-semibold text-slate-700">Digite CANCELAR<input autoFocus required value={confirmation} onChange={e=>setConfirmation(e.target.value)} className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-slate-50 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden" /></label>
      {error && <p role="alert" className="text-red-700 text-xs">{error}</p>}
      <div className="flex gap-3 justify-end pt-2"><button type="button" disabled={busy} onClick={()=>setCancelOpen(false)} className="border border-slate-200 hover:bg-slate-50 px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer">Voltar</button><button disabled={busy || confirmation!=='CANCELAR'} className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs cursor-pointer disabled:opacity-50">{busy?'Processando…':'Cancelar renovação'}</button></div>
    </form></div>}
    <footer className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200 text-xs text-slate-600">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 font-bold text-teal-700 hover:text-teal-800 transition cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar ao Zemda
      </button>
      <div>
        {currentUser ? (
          <button onClick={logout} className="text-slate-500 hover:text-red-600 underline cursor-pointer">
            Sair da conta
          </button>
        ) : (
          <a href="/assinatura" className="underline hover:text-teal-700 font-semibold">
            Já tenho conta · Entrar
          </a>
        )}
      </div>
    </footer>
  </section>;
};

export const BillingBanner:React.FC<{summary:any}>=({summary})=>{
  if(!summary || !['PAST_DUE','SUSPENDED'].includes(summary.status)) return null;
  return <div className="m-4 p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl flex flex-wrap gap-3 items-center" role="status"><AlertCircle className="w-5 h-5"/><p className="flex-1">Há uma pendência na sua assinatura. Regularize o pagamento para evitar a suspensão do acesso.</p><button onClick={()=>window.dispatchEvent(new CustomEvent('zemda-navigate',{detail:{view:'subscription'}}))} className="font-bold underline">Assinatura e Plano</button></div>;
};
