import React from 'react';
import { BILLING_BENEFITS } from '../billing/billingBenefits';

export interface RegistrationPlan {
  id: string;
  code: string;
  name: string;
  monthly_price: number;
  max_users: number;
  cycle: string;
  trial_days: number;
}

export function RegistrationPlans({ plans, selectedCode, busy, onChoose, onBack }: {
  plans: RegistrationPlan[];
  selectedCode: string;
  busy: boolean;
  onChoose: (plan: RegistrationPlan) => void;
  onBack: () => void;
}) {
  return <section className="space-y-5">
    <div><h3 className="text-xl font-extrabold text-slate-900">Escolha como começar no Zemda</h3>
      <p className="text-sm text-slate-600 mt-2">Você pode testar o Zemda ou escolher um plano para começar agora.</p></div>
    <div className="grid md:grid-cols-3 gap-4">
      {plans.map(plan => <article key={plan.id} className={`rounded-2xl border p-4 flex flex-col gap-3 min-w-0 ${plan.trial_days ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white'}`}>
        {plan.trial_days > 0 && <span className="text-xs font-bold text-teal-800">{plan.trial_days} dias grátis</span>}
        <h4 className="font-extrabold text-slate-900">{plan.name}</h4>
        <p className="text-xl font-bold text-slate-900">{plan.monthly_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<span className="text-xs font-normal">{plan.cycle === 'MONTHLY' ? '/mês' : ` / ${plan.cycle}`}</span></p>
        <p className="text-sm text-slate-700">{plan.max_users === 1 ? '1 acesso' : `Até ${plan.max_users} acessos`}</p>
        <ul className="text-xs text-slate-600 space-y-1">{BILLING_BENEFITS.slice(0, 3).map(benefit => <li key={benefit}>✓ {benefit}</li>)}</ul>
        {plan.trial_days > 0 ? <p className="text-xs text-teal-900">Teste grátis por {plan.trial_days} dias. Sem pagamento para começar.</p> : <p className="text-xs text-slate-600">Ativação após confirmação do pagamento. Dados do pagador na próxima tela.</p>}
        <button type="button" disabled={busy} aria-pressed={selectedCode === plan.code} onClick={() => onChoose(plan)} className="mt-auto px-4 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold disabled:opacity-50">
          {busy && selectedCode === plan.code ? 'Criando conta...' : plan.trial_days ? 'Começar teste grátis' : 'Contratar agora'}
        </button>
      </article>)}
    </div>
    <p className="text-xs text-slate-600">O módulo profissional continua definido pela sua profissão. Os limites de acessos seguem o plano escolhido.</p>
    <button type="button" disabled={busy} onClick={onBack} className="text-sm font-bold text-teal-700 disabled:opacity-50">Voltar aos seus dados</button>
  </section>;
}
