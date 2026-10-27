import { BillingAccessStatus } from './BillingAccessStatus';
import { ResponsiveTable } from '../common/ResponsiveTable';
import { navigateToUrl } from '../../utils/nativeNavigation';
import { BILLING_BENEFITS } from './billingBenefits';
import { trackConfirmedPurchase } from '../../utils/purchaseAnalytics';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { CreditCard, Users, CheckCircle2, AlertCircle, ArrowUpRight, ArrowLeft, Sparkles, Minus, Plus, X } from 'lucide-react';

const money=(v:number)=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=(v:string)=>v?new Date(v.slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const emptyProfile={name:'',cpfCnpj:'',email:'',phone:'',postalCode:'',address:'',addressNumber:'',province:'',complement:''};
const statuses:Record<string,string>={ACTIVE:'Ativo',PENDING_PAYMENT:'Aguardando pagamento',PAST_DUE:'Pagamento pendente',SUSPENDED:'Suspenso',CANCELED:'Cancelado',NOT_SUBSCRIBED:'Escolha seu plano',CONFIRMED:'Pago',RECEIVED:'Pago',OVERDUE:'Vencido',PENDING:'Pendente',REFUNDED:'Estornado',DELETED:'Removido',TRIAL:'Teste Grátis (7 dias)',TRIAL_EXPIRED:'Teste Grátis Encerrado'};
type BillingSnapshot = {key:string;summary:any;status:'idle'|'loading'|'loaded'|'error';error:string};

export function calculatePlanSimulation(plan: any, requestedSeats: number) {
  const includedSeats = Number(plan?.max_users || 1);
  const maxLimit = plan?.total_user_limit ? Number(plan.total_user_limit) : null;
  const clamped = Math.max(
    includedSeats,
    maxLimit ? Math.min(maxLimit, Math.floor(Number(requestedSeats) || includedSeats)) : Math.floor(Number(requestedSeats) || includedSeats)
  );
  const basePrice = Number(plan?.monthly_price || 0);
  const extraSeatPrice = Number(plan?.extra_user_price || 0);
  const extraSeats = Math.max(0, clamped - includedSeats);
  const extraCost = (extraSeats * Math.round(extraSeatPrice * 100)) / 100;
  const monthlyTotal = (Math.round(basePrice * 100) + extraSeats * Math.round(extraSeatPrice * 100)) / 100;
  return {
    totalSeats: clamped,
    includedSeats,
    maxLimit,
    basePrice,
    extraSeatPrice,
    extraSeats,
    extraCost,
    monthlyTotal
  };
}

export function useBillingSummary(includeGlobal=false) {
  const {currentUser,currentTenant}=useAuth();
  const identityKey=`${currentUser?.id || ''}:${currentTenant?.id || currentUser?.tenantId || ''}`;
  const enabled=!!currentUser && (currentUser.role!=='superadmin' || includeGlobal);
  const identity=useRef(identityKey); identity.current=identityKey;
  const request=useRef(0);
  const [snapshot,setSnapshot]=useState<BillingSnapshot>({key:'',summary:null,status:'idle',error:''});
  const reload=useCallback(async()=>{
    const sequence=++request.current;
    if(!enabled) {setSnapshot({key:identityKey,summary:null,status:'idle',error:''});return;}
    setSnapshot(previous=>previous.key===identityKey && previous.status==='loaded' ? previous :
      {key:identityKey,summary:null,status:'loading',error:''});
    try {
      const summary=await ApiClient.get<any>('/v1/subscriptions/current');
      if(!summary || typeof summary.canOperate!=='boolean') throw new Error('Resposta de assinatura inválida.');
      if(identity.current===identityKey && sequence===request.current)
        setSnapshot({key:identityKey,summary,status:'loaded',error:''});
    } catch(e:any){
      if(identity.current===identityKey && sequence===request.current)
        setSnapshot({key:identityKey,summary:null,status:'error',error:e.message || 'Não foi possível consultar sua assinatura.'});
    }
  },[identityKey,enabled]);
  useEffect(()=>{
    void reload();
    const timer=setInterval(()=>{if(!document.hidden) void reload();},15000);
    const refresh=()=>void reload();
    const denied=()=>{setSnapshot({key:identityKey,summary:null,status:'loading',error:''});void reload();};
    window.addEventListener('zemda-billing-refresh',refresh);
    window.addEventListener('zemda-billing-denied',denied);
    return()=>{++request.current;clearInterval(timer);window.removeEventListener('zemda-billing-refresh',refresh);window.removeEventListener('zemda-billing-denied',denied);};
  },[reload]);
  const current=snapshot.key===identityKey;
  const status=enabled ? (current && snapshot.status!=='idle' ? snapshot.status : 'loading') : 'idle';
  return {summary:current && status==='loaded' ? snapshot.summary : null,
    loading:status==='loading',status,error:current && status==='error' ? snapshot.error : '',reload};
}

export interface BillingViewProps {
  publicPage?: boolean;
  callback?: string;
  onBack?: () => void;
}

export const BillingView: React.FC<BillingViewProps> = ({
  publicPage = false,
  callback,
  onBack
}) => {
  const { currentUser, logout, reloadSession } = useAuth();
  const { summary, loading: billingLoading, error: summaryError, reload } = useBillingSummary(true);
  const [plans, setPlans] = useState<any[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [showPlans, setShowPlans] = useState(publicPage), [cancelOpen, setCancelOpen] = useState(false), [confirmation, setConfirmation] = useState(''), [reason, setReason] = useState('');
  const [modalPlan, setModalPlan] = useState<any | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<number>(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const checkoutRequested = useRef(new URLSearchParams(window.location.search).get('checkout') === '1');
  const [registrationCheckout, setRegistrationCheckout] = useState(false);
  const [pendingPlanCode, setPendingPlanCode] = useState<string | null>(null);
  const [pendingSeats, setPendingSeats] = useState<number | null>(null);

  useEffect(() => { if (callback === 'sucesso' && summary?.canManage && summary.status === 'ACTIVE') trackConfirmedPurchase(summary.confirmedPurchase); }, [callback, summary]);
  const [profileOpen, setProfileOpen] = useState(false), [profile, setProfile] = useState(emptyProfile);
  const canManage = summary?.canManage ?? (!currentUser || ['superadmin', 'clinic_admin'].includes(currentUser.role) || (currentUser as any).permissions?.includes('manage_subscription'));
  useEffect(() => { ApiClient.get<any[]>('/v1/plans').then(setPlans).catch((e: any) => setError(e.message)); }, []);
  useEffect(() => { if (currentUser && canManage) ApiClient.get<any>('/v1/subscriptions/profile').then(p => { setProfile(Object.fromEntries(Object.keys(emptyProfile).map(k => [k, p[k] || ''])) as typeof emptyProfile); if (!p.cpfCnpj || !p.postalCode || !p.address || !p.addressNumber || !p.province) setProfileOpen(true); }).catch(() => { }); }, [currentUser?.id, canManage]);
  const refresh = async () => { await reload(); window.dispatchEvent(new Event('zemda-billing-refresh')); };

  const startSoloTrial = async () => {
    if (!currentUser) { window.location.assign('/cadastro?plan=SOLO&isTrial=true'); return; }
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      const res = await ApiClient.post<any>('/v1/subscriptions/start-trial', {});
      setNotice(res.message || 'Teste grátis de 7 dias ativado com sucesso! Aproveite todos os recursos do Zemda Solo.');
      await refresh();
      await reloadSession();
      setShowPlans(false);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const openPlanSelectionModal = (plan: any) => {
    if (!plan) return;
    const included = Number(plan.max_users || 1);
    const maxLimit = plan.total_user_limit ? Number(plan.total_user_limit) : null;
    let initialSeats = included;
    if (summary?.plan?.code === plan.code && summary?.contractedUsers) {
      initialSeats = Math.max(included, maxLimit ? Math.min(maxLimit, Number(summary.contractedUsers)) : Number(summary.contractedUsers));
    }
    setSelectedSeats(initialSeats);
    setModalPlan(plan);
  };

  const openCheckout = async (code: string, totalSeats: number) => {
    const result = await ApiClient.post<{ url: string }>('/v1/subscriptions/checkout', {
      planCode: code,
      totalSeats,
      contractedUsers: totalSeats
    });
    await navigateToUrl(result.url);
  };

  const confirmPlanSelection = async (code: string, totalSeats: number) => {
    if (!currentUser) {
      window.location.assign(`/cadastro?plan=${encodeURIComponent(code)}&seats=${encodeURIComponent(String(totalSeats))}`);
      return;
    }
    setPendingPlanCode(code);
    setPendingSeats(totalSeats);
    setModalPlan(null);
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (summary?.managed && summary.status === 'ACTIVE') {
        const result = await ApiClient.post<any>('/v1/subscriptions/change-plan', {
          planCode: code,
          totalSeats,
          contractedUsers: totalSeats
        });
        setNotice(result.message);
        await refresh();
        setShowPlans(false);
      } else {
        await openCheckout(code, totalSeats);
      }
    } catch (e: any) {
      setError(e.message);
      if (['BILLING_ADDRESS_REQUIRED', 'ASAAS_VALIDATION_ERROR'].includes(e.code)) {
        setProfileOpen(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { const result = await ApiClient.post<any>('/v1/subscriptions/cancel', { confirmation, reason }); setNotice(result.message); setCancelOpen(false); setConfirmation(''); setReason(''); await refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await ApiClient.put<any>('/v1/subscriptions/profile', profile);
      setNotice(result.message); setProfileOpen(false);
      const targetCode = pendingPlanCode || (registrationCheckout && summary?.selectedPlan ? summary.selectedPlan.code : null);
      if (targetCode) {
        const planObj = plans.find(p => p.code === targetCode) || summary?.selectedPlan || { code: targetCode, max_users: 1 };
        const seats = pendingSeats ?? Number(planObj.max_users || 1);
        setPendingPlanCode(null);
        setPendingSeats(null);
        await openCheckout(targetCode, seats);
      }
    } catch (e: any) {
      setError(e.message); setProfileOpen(true);
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!summary || !currentUser || !checkoutRequested.current) return;
    checkoutRequested.current = false;
    if (['NOT_SUBSCRIBED','PENDING_PAYMENT'].includes(summary.status) && summary.selectedPlan) {
      setRegistrationCheckout(true); setProfileOpen(true); setShowPlans(false);
      setNotice('Plano escolhido: ' + summary.selectedPlan.name + '. Complete os dados do pagador para continuar ao pagamento.');
    }
  }, [summary, currentUser]);

  useEffect(() => {
    if (summary?.canOperate && currentUser?.onboardingStatus === 'pending_payment') void reloadSession();
  }, [summary?.canOperate,currentUser?.onboardingStatus]);

  const pending = summary?.status === 'PAST_DUE';

  const navigateToDashboard = () => {
    if (currentUser) {
      sessionStorage.setItem('activeView', 'dashboard');
      if (window.location.pathname !== '/dashboard') {
        window.history.pushState({ view: 'dashboard' }, '', '/dashboard');
      }
      window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'dashboard' } }));
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      window.location.assign('/dashboard');
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (currentUser) {
      navigateToDashboard();
    } else {
      window.location.assign('/');
    }
  };

  if (currentUser && (billingLoading || summaryError)) {
    return <BillingAccessStatus error={summaryError} onRetry={() => void reload()} />;
  }

  const modalSim = modalPlan ? calculatePlanSimulation(modalPlan, selectedSeats) : null;

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

    {currentUser && !summary?.canOperate && <div className="rounded-xl bg-amber-50 text-amber-950 p-4 space-y-2" role="status">
      <p>{summary ? 'Acesso operacional indisponível. Regularize a assinatura para continuar. Seus dados estão preservados.' : 'Consultando a liberação financeira da clínica…'}{summary && !canManage && ' Solicite a regularização ao responsável da clínica.'}</p>
      <button type="button" onClick={() => logout()} className="underline font-semibold">Sair da conta</button>
    </div>}

    {callback && <div className="rounded-2xl border bg-white p-5" role="status">
      <h2 className="font-bold">{callback==='sucesso'?'Pagamento enviado para confirmação.':callback==='cancelada'?'Você retornou do checkout.':'O prazo deste checkout terminou.'}</h2>
      <p className="text-sm text-slate-600 mt-1">{callback==='sucesso'?'Estamos confirmando sua assinatura. Esta página será atualizada após a confirmação do Asaas.':'O retorno do checkout não ativa nenhum plano. Consulte o status abaixo antes de tentar novamente.'}</p>
    </div>}

    {(error || summaryError) && <p className="rounded-xl p-4 bg-red-50 text-red-800" role="alert">{error || summaryError} <button onClick={()=>void refresh()} className="underline">Atualizar</button></p>}
    {notice && <p className="rounded-xl p-4 bg-emerald-50 text-emerald-800" role="status">{notice}</p>}
    {summary?.status==='ACTIVE' && callback==='sucesso' && <div className="p-4 rounded-xl bg-emerald-50 text-emerald-800 flex gap-3 items-center"><CheckCircle2 />Assinatura ativada com sucesso.<button className="underline ml-auto font-semibold hover:text-emerald-950 cursor-pointer" onClick={async()=>{await reloadSession();navigateToDashboard();}}>Acessar Zemda</button></div>}
    {summary?.selectedPlan && !summary?.managed && !registrationCheckout && canManage && <div className="p-4 bg-teal-50 rounded-xl text-sm">Plano escolhido: <strong>{summary.selectedPlan.name}</strong><button className="ml-3 underline" onClick={()=>{setRegistrationCheckout(true);setProfileOpen(true);}}>Continuar contratação</button></div>}

    {pending && <div className="bg-amber-50 text-amber-900 p-4 rounded-xl flex gap-3"><AlertCircle className="shrink-0"/><p>Há uma pendência na sua assinatura. Regularize o pagamento para evitar a suspensão do acesso. Prazo: {date(summary.gracePeriodUntil)}.</p></div>}

    {summary?.isTrial && (
      <div className="bg-gradient-to-r from-teal-50 via-emerald-50/50 to-teal-50 border border-teal-200/90 text-teal-950 p-5 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-teal-950">Teste Grátis do Zemda Solo Ativo</h3>
            <p className="text-xs text-teal-800/90 mt-0.5">
              Restam <strong>{summary.trialDaysRemaining ?? 0} {summary.trialDaysRemaining === 1 ? 'dia' : 'dias'}</strong> de teste. Você tem acesso completo aos recursos compatíveis com seu perfil.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const soloPlan = plans.find(p => p.code === 'SOLO');
            if (soloPlan) openPlanSelectionModal(soloPlan);
            else setShowPlans(true);
          }}
          className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
        >
          Assinar Plano Solo
        </button>
      </div>
    )}

    {summary?.status==='TRIAL_EXPIRED' && (
      <div className="bg-rose-50 border border-rose-200 text-rose-950 p-5 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-rose-950">Período de Teste Grátis Encerrado</h3>
            <p className="text-xs text-rose-800 mt-0.5">
              Seus dados, pacientes, agendamentos e prontuários continuam <strong>100% preservados e seguros</strong>. Assine o Zemda Solo para continuar seus atendimentos.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const soloPlan = plans.find(p => p.code === 'SOLO');
            if (soloPlan) openPlanSelectionModal(soloPlan);
            else setShowPlans(true);
          }}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
        >
          Assinar Zemda Solo
        </button>
      </div>
    )}

    {summary && <div className="bg-white border border-slate-200/80 shadow-xs rounded-3xl p-6 sm:p-8 space-y-6">
      <p className="text-sm text-slate-600">Clínica: <strong>{summary.clinicName}</strong>{summary.environment==='sandbox' && <span className="ml-3 text-amber-700">Ambiente de teste · Sandbox</span>}</p>
      <div className="grid sm:grid-cols-4 gap-5">
        <div>
          <p className="text-xs text-slate-500">Plano atual</p>
          <h2 className="font-bold text-lg text-slate-900">{summary.isTrial ? 'Zemda Solo (Trial)' : (summary.plan?.name || 'Sem assinatura Asaas')}</h2>
          <p className="text-teal-700 font-semibold">{summary.isTrial ? 'R$ 0,00 (7 dias grátis)' : (summary.plan ? money(summary.monthlyTotal ?? summary.plan.monthly_price)+'/mês' : 'Escolha um dos planos abaixo')}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Status</p>
          <p className="font-bold text-slate-800">{summary.isTrial ? `Teste Grátis · ${summary.trialDaysRemaining ?? 0} dias restantes` : (statuses[summary.status] || summary.status)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Usuários ativos</p>
          <p className="font-bold text-slate-800">{summary.activeUsers} / {summary.maxUsers ?? '—'} acessos utilizados</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{summary.isTrial ? 'Término do teste' : 'Próxima cobrança'}</p>
          <p className="font-bold text-slate-800">{summary.isTrial ? date(summary.trialEndsAt) : summary.status==='CANCELED'?'Renovação cancelada':date(summary.nextDueDate)}</p>
        </div>
      </div>
      {summary.pendingPlan && <p className="text-teal-800 bg-teal-50 border border-teal-200/60 rounded-xl p-3 text-sm">Mudança para {summary.pendingPlan.name}, {summary.pendingContractedUsers ?? summary.pendingPlan.max_users} acessos por {money(summary.pendingMonthlyTotal ?? summary.pendingPlan.monthly_price)}/mês, no ciclo de {date(summary.changeEffectiveOn)}, após confirmação do pagamento.</p>}
      {summary.status==='CANCELED' && summary.currentPeriodEnd && <p>Acesso pago até {date(summary.currentPeriodEnd)}. Seus dados serão preservados.</p>}
      {canManage && <div className="flex flex-wrap gap-3">
        <button className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-all" onClick={()=>{setRegistrationCheckout(false);setShowPlans(v=>!v);}}>Alterar plano</button>
        {summary.status === 'ACTIVE' && summary.plan && (
          <button
            type="button"
            disabled={busy || !!summary.pendingPlan}
            onClick={() => openPlanSelectionModal(plans.find(p => p.code === summary.plan.code) || summary.plan)}
            className="px-4 py-2 border border-teal-200 bg-teal-50/70 hover:bg-teal-100/70 text-teal-800 font-bold text-xs rounded-xl cursor-pointer transition-all disabled:opacity-50"
          >
            Atualizar acessos
          </button>
        )}
        <button className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-all" onClick={()=>setProfileOpen(v=>!v)}>Dados de cobrança</button>
        {summary.managed && <button className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-all" onClick={()=>setCancelOpen(true)}>Gerenciar assinatura</button>}
        <button className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-all" onClick={()=>setHistoryOpen(v=>!v)}>Histórico de cobranças</button>
      </div>}
      {!canManage && <p className="text-slate-600 text-sm">Solicite ao responsável da clínica a regularização ou alteração do plano.</p>}
    </div>}

    {currentUser && canManage && profileOpen && <form onSubmit={saveProfile} className="bg-white border border-slate-200/80 shadow-xs rounded-3xl p-6 sm:p-8 space-y-4"><h2 className="font-bold text-slate-900">Dados de cobrança</h2><p className="text-sm text-slate-600">Esses dados identificam o pagador no Asaas. Os dados do cartão são informados somente no checkout hospedado.</p><div className="grid sm:grid-cols-2 gap-4">
      {([['name','Nome do pagador'],['cpfCnpj','CPF/CNPJ'],['email','E-mail'],['phone','Telefone'],['postalCode','CEP'],['address','Logradouro'],['addressNumber','Número'],['province','Bairro'],['complement','Complemento (opcional)']] as const).map(([key,label])=><label key={key} className="text-xs font-semibold text-slate-700">{label}<input required={key!=='phone' && key!=='complement'} type={key==='email'?'email':'text'} maxLength={key==='email'?200:key==='postalCode'?9:['phone','cpfCnpj','addressNumber'].includes(key)?30:160} value={profile[key]} onChange={e=>setProfile({...profile,[key]:e.target.value})} className="w-full block border border-slate-200 rounded-xl p-2.5 mt-1 bg-slate-50 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden" /></label>)}</div><p className="text-xs text-slate-500">Informe o endereço do pagador. A cidade é identificada pelo Asaas a partir do CEP.</p><button disabled={busy} className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs cursor-pointer transition-all disabled:opacity-50">{registrationCheckout ? 'Salvar e ir para pagamento' : 'Salvar dados de cobrança'}</button></form>}

    {canManage && !registrationCheckout && (showPlans || !summary?.managed || summary?.status==='PENDING_PAYMENT' || summary?.status==='TRIAL_EXPIRED' || summary?.isTrial) && (
      <div className="space-y-6 pt-2">
        {/* Cards dos Planos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(plan => {
            const codeUpper = (plan.code || '').toUpperCase();
            const isSolo = codeUpper === 'SOLO' || plan.max_users === 1;
            const isTeam = codeUpper === 'TEAM' || (plan.name || '').toLowerCase().includes('equipe');
            const isFeatured = isTeam;
            const userLimitLabel = `${plan.max_users} ${plan.max_users===1 ? 'acesso incluído' : 'acessos incluídos'}`;
            const extraPriceFormatted = money(plan.extra_user_price ?? (isSolo ? 59.9 : isTeam ? 44.9 : 29.9));
            const capText = isSolo
              ? 'Máximo de 3 acessos'
              : isTeam
                ? 'Até 12 acessos'
                : 'Expansão acima de 15 acessos';

            let topBadge = isFeatured ? 'Mais Escolhido' : null;
            let subDescription = isSolo
              ? 'Para atendimento autônomo e consultórios individuais.'
              : isTeam
                ? 'Para consultórios em crescimento e equipes multidisciplinares.'
                : 'Para clínicas consolidadas, policlínicas e centros de saúde.';

            const planButtonLabel = isSolo
              ? 'Assinar Zemda Solo'
              : isTeam
                ? 'Assinar Zemda Equipe'
                : 'Assinar Zemda Clínica';

            const canStartTrial = isSolo && (!currentUser || summary?.trialEligible === true) && summary?.status !== 'ACTIVE' && !summary?.isTrial;

            if (isSolo) {
              if (summary?.isTrial) {
                topBadge = `Em teste grátis (${summary.trialDaysRemaining ?? 0}d restantes)`;
                subDescription = 'Seu teste de 7 dias está ativo. Assine agora para continuar utilizando o Zemda Solo sem interrupções.';
              } else if (summary?.status === 'TRIAL_EXPIRED') {
                topBadge = 'Teste encerrado';
                subDescription = 'Seu período de teste terminou. Assine o Zemda Solo para continuar seus atendimentos.';
              } else if (canStartTrial) {
                topBadge = '7 Dias Grátis';
              }
            }

            const isCurrentActivePlan = summary?.managed && summary?.status === 'ACTIVE' && summary?.plan?.code === plan.code;
            const buttonText = isCurrentActivePlan ? 'Ajustar acessos do plano' : planButtonLabel;
            const buttonDisabled = busy || !!summary?.pendingPlan;

            return (
              <article
                key={plan.code}
                className={`bg-white rounded-3xl p-6 sm:p-8 flex flex-col justify-between gap-6 transition-all relative ${
                  isFeatured || (isSolo && (summary?.isTrial || canStartTrial))
                    ? 'border-2 border-teal-500 shadow-xl shadow-teal-900/10 md:scale-[1.01] z-10'
                    : 'border border-slate-200 shadow-xs hover:border-slate-300'
                }`}
              >
                {topBadge && (
                  <span className={`absolute -top-3.5 left-1/2 -translate-x-1/2 text-white text-[11px] font-extrabold uppercase tracking-wider px-3.5 py-1 rounded-full shadow-xs whitespace-nowrap ${
                    summary?.status === 'TRIAL_EXPIRED' && isSolo ? 'bg-rose-600' : 'bg-gradient-to-r from-teal-600 to-emerald-600'
                  }`}>
                    {topBadge}
                  </span>
                )}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">{plan.name}</h2>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 text-xs font-bold mt-2">
                      <Users className="w-3.5 h-3.5 text-teal-600" />
                      <span>{userLimitLabel}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">
                      {money(plan.monthly_price)}
                      <span className="text-xs text-slate-500 font-normal">/mês</span>
                    </p>
                    <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-0.5">
                      <p className="font-medium text-slate-600">+ acessos adicionais por {extraPriceFormatted}/mês cada</p>
                      <p className="text-slate-400">{capText}</p>
                    </div>
                    <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                      {subDescription}
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
                      <span>Zemda360 liberado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>Agenda, Prontuário, Financeiro e IA</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={buttonDisabled}
                    onClick={() => openPlanSelectionModal(plan)}
                    className={`w-full font-bold text-xs py-3 px-4 rounded-xl cursor-pointer transition-all disabled:opacity-50 ${
                      isFeatured || (isSolo && (summary?.isTrial || canStartTrial))
                        ? 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-md shadow-teal-700/20'
                        : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
                    }`}
                  >
                    {busy ? 'Aguarde…' : buttonText}
                  </button>

                  {canStartTrial && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void startSoloTrial()}
                      className="w-full font-semibold text-xs py-2.5 px-4 rounded-xl border border-teal-200 bg-teal-50/70 hover:bg-teal-100/80 text-teal-800 cursor-pointer transition-all disabled:opacity-50"
                    >
                      Começar teste grátis (7 dias)
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* Recursos inclusos em todos os planos */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Todos os planos do Zemda incluem:
            </h3>
            <span className="px-2.5 py-0.5 bg-teal-50 text-teal-800 text-[11px] font-bold rounded-lg border border-teal-200/60">
              Plataforma completa
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600 font-medium">
            {BILLING_BENEFITS.map(benefit => <div key={benefit} className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" /><span>{benefit}</span></div>)}
          </div>
        </div>

        {/* Aviso de suporte e condições comerciais */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl text-center text-xs text-slate-600 leading-relaxed">
          O teste grátis de 7 dias é exclusivo do plano <strong>Zemda Solo</strong>. Para dúvidas comerciais ou condições personalizadas de implantação dos planos <strong>Equipe</strong> e <strong>Clínica</strong>, entre em contato pelo <a href="mailto:suporte@zemda.com.br" className="text-teal-700 font-bold underline hover:text-teal-900">suporte@zemda.com.br</a>.
        </div>
      </div>
    )}

    {/* Modal de Escolha de Quantidade de Acessos (Etapa após escolher o plano) */}
    {modalPlan && modalSim && (
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal"
        onClick={() => !busy && setModalPlan(null)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Configurar ${modalPlan.name}`}
          onClick={e => e.stopPropagation()}
          className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 space-y-5"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 block">
                Plano escolhido
              </span>
              <h2 className="text-xl font-black text-slate-900 mt-0.5">
                {modalPlan.name}
              </h2>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                {modalSim.includedSeats} {modalSim.includedSeats === 1 ? 'acesso incluído' : 'acessos incluídos'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalPlan(null)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Seletor Único de Quantidade de Acessos */}
          <div className="space-y-2">
            <label htmlFor="plan-seat-selector" className="block text-xs font-bold text-slate-700">
              Quantidade desejada:
            </label>
            <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
              <button
                type="button"
                aria-label="Diminuir acessos"
                disabled={busy || modalSim.totalSeats <= modalSim.includedSeats}
                onClick={() => setSelectedSeats(modalSim.totalSeats - 1)}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center justify-center font-bold shadow-2xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="flex-1 text-center">
                <input
                  id="plan-seat-selector"
                  aria-label="Quantidade de acessos"
                  type="number"
                  min={modalSim.includedSeats}
                  max={modalSim.maxLimit ?? undefined}
                  step="1"
                  value={modalSim.totalSeats}
                  disabled={busy}
                  onChange={e => {
                    const raw = parseInt(e.target.value, 10);
                    if (Number.isNaN(raw)) {
                      setSelectedSeats(modalSim.includedSeats);
                    } else {
                      setSelectedSeats(
                        Math.max(
                          modalSim.includedSeats,
                          modalSim.maxLimit ? Math.min(modalSim.maxLimit, raw) : raw
                        )
                      );
                    }
                  }}
                  className="w-20 text-center text-lg font-black text-slate-900 bg-transparent focus:outline-hidden"
                />
                <span className="block text-[11px] text-slate-500 font-medium">
                  {modalSim.totalSeats === 1 ? '1 acesso' : `${modalSim.totalSeats} acessos`}
                </span>
              </div>

              <button
                type="button"
                aria-label="Aumentar acessos"
                disabled={busy || (modalSim.maxLimit !== null && modalSim.totalSeats >= modalSim.maxLimit)}
                onClick={() => setSelectedSeats(modalSim.totalSeats + 1)}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center justify-center font-bold shadow-2xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500 text-center">
              {modalSim.extraSeats > 0
                ? `${modalSim.extraSeats} ${modalSim.extraSeats === 1 ? 'acesso adicional' : 'acessos adicionais'} × ${money(modalSim.extraSeatPrice)}`
                : `Sem acessos adicionais (+ ${money(modalSim.extraSeatPrice)}/mês por acesso extra)`}
              {' · '}
              {modalSim.maxLimit ? `Limite máximo de ${modalSim.maxLimit} acessos` : 'Expansão acima de 15 acessos'}
            </p>
          </div>

          {/* Resumo Financeiro da Simulação */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>Plano ({modalSim.includedSeats} {modalSim.includedSeats === 1 ? 'incluído' : 'incluídos'}):</span>
              <strong className="text-slate-800">{money(modalSim.basePrice)}</strong>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Adicionais ({modalSim.extraSeats}):</span>
              <strong className="text-slate-800">{money(modalSim.extraCost)}</strong>
            </div>
            <div className="pt-2.5 border-t border-slate-200 flex items-baseline justify-between">
              <span className="text-sm font-bold text-slate-900">Total mensal:</span>
              <span className="text-xl font-black text-teal-700">
                {money(modalSim.monthlyTotal)}
                <span className="text-xs font-normal text-slate-500">/mês</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => setModalPlan(null)}
              className="sm:w-1/3 py-3 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs cursor-pointer transition"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmPlanSelection(modalPlan.code, modalSim.totalSeats)}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs shadow-md shadow-teal-700/20 cursor-pointer transition disabled:opacity-50"
            >
              {busy ? 'Processando…' : 'Continuar para contratação'}
            </button>
          </div>
        </div>
      </div>
    )}

    {historyOpen && summary && <div className="bg-white border border-slate-200/80 shadow-xs rounded-3xl p-6 overflow-x-auto mobile-table-container"><h2 className="font-bold text-slate-900 mb-4">Histórico de cobranças</h2><ResponsiveTable className="w-full text-xs text-left"><thead><tr className="border-b border-slate-100 text-slate-500"><th className="p-3">Data</th><th>Valor</th><th>Forma</th><th>Status</th><th>Pagamento</th></tr></thead><tbody>
      {summary.payments.map((p:any)=><tr key={p.id} className="border-b border-slate-100"><td className="p-3 text-slate-700 font-medium">{date(p.due_date)}</td><td className="font-semibold text-slate-900">{money(p.amount)}</td><td>{p.billing_type==='CREDIT_CARD'?'Cartão':p.billing_type}</td><td><span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">{statuses[p.status] || p.status}</span></td><td>{p.invoice_url && <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:text-teal-800 font-bold inline-flex items-center gap-1">Abrir cobrança<ArrowUpRight className="w-3.5 h-3.5"/></a>}</td></tr>)}
    </tbody></ResponsiveTable>{!summary.payments.length && <p className="text-slate-500 p-4 text-xs">Nenhuma cobrança registrada.</p>}</div>}

    {summary && ['PAST_DUE','SUSPENDED'].includes(summary.status) && canManage && <button onClick={()=>setHistoryOpen(true)} className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-xs p-3 rounded-xl shadow-xs">Regularizar pagamento</button>}

    {cancelOpen && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal"><form role="dialog" aria-modal="true" aria-label="Gerenciar assinatura" onSubmit={cancel} className="bg-white p-6 sm:p-8 rounded-3xl space-y-4 max-w-lg w-full shadow-2xl border border-slate-100">
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
  if(!summary) return null;

  // 1. Trial em andamento
  if (summary.isTrial || summary.status === 'TRIAL') {
    const days = summary.trialDaysRemaining ?? 0;
    if (days <= 2) {
      return (
        <div className="m-4 p-3.5 bg-amber-50 text-amber-950 border border-amber-300 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs" role="alert">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-bold text-amber-900">
              {days === 0 ? 'Último dia do seu teste grátis!' : `Atenção: Seu teste grátis termina em ${days} ${days === 1 ? 'dia' : 'dias'}!`}
            </span>
            <span className="hidden md:inline text-amber-800">
              Assine o Zemda Solo para manter seu fluxo e agendamentos sem interrupções.
            </span>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'subscription' } }))}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl cursor-pointer shadow-xs transition"
          >
            Assinar Zemda Solo
          </button>
        </div>
      );
    }

    return (
      <div className="m-4 px-4 py-2 bg-teal-50/90 text-teal-950 border border-teal-200/90 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs" role="status">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse shrink-0" />
          <span className="font-semibold text-teal-900">
            Teste grátis Zemda Solo · {days} {days === 1 ? 'dia restante' : 'dias restantes'}
          </span>
          <span className="hidden md:inline text-teal-700/80">
            · Acesso liberado a todas as ferramentas do seu perfil
          </span>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'subscription' } }))}
          className="font-bold text-teal-800 hover:text-teal-950 underline cursor-pointer"
        >
          Assinar plano
        </button>
      </div>
    );
  }

  // 2. Trial Expirado
  if (summary.status === 'TRIAL_EXPIRED') {
    return (
      <div className="m-4 p-3.5 bg-rose-50 text-rose-950 border border-rose-300 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs" role="alert">
        <div className="flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <div>
            <span className="font-bold text-rose-900">Seu teste grátis encerrou. </span>
            <span className="text-rose-800">Assine o Zemda Solo para continuar seus atendimentos. Seus dados e prontuários estão salvos.</span>
          </div>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'subscription' } }))}
          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl cursor-pointer shadow-xs transition"
        >
          Assinar agora
        </button>
      </div>
    );
  }

  // 3. Pagamento pendente ou suspenso
  if (['PAST_DUE','SUSPENDED'].includes(summary.status)) {
    return (
      <div className="m-4 p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl flex flex-wrap gap-3 items-center" role="status">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="flex-1">Há uma pendência na sua assinatura. Regularize o pagamento para evitar a suspensão do acesso.</p>
        <button onClick={()=>window.dispatchEvent(new CustomEvent('zemda-navigate',{detail:{view:'subscription'}}))} className="font-bold underline cursor-pointer">
          Assinatura e Plano
        </button>
      </div>
    );
  }

  return null;
};
