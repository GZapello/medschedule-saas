import React from 'react';
import { BILLING_BENEFITS } from '../billing/billingBenefits';
import { Sparkles, Check, ArrowLeft, ShieldCheck, CreditCard, Users, Building2, User } from 'lucide-react';

export interface RegistrationPlan {
  id: string;
  code: string;
  name: string;
  monthly_price: number;
  max_users: number;
  cycle: string;
  trial_days: number;
}

export function RegistrationPlans({
  plans,
  selectedCode,
  busy,
  onChoose,
  onBack,
  onSelectPlan
}: {
  plans: RegistrationPlan[];
  selectedCode: string;
  busy: boolean;
  onChoose: (plan: RegistrationPlan) => void;
  onBack: () => void;
  onSelectPlan?: (plan: RegistrationPlan) => void;
}) {
  const getPlanSubtitle = (code: string) => {
    switch (code) {
      case 'SOLO':
        return 'Para profissionais autônomos e consultórios individuais.';
      case 'EQUIPE':
        return 'Para consultórios em crescimento e equipes multidisciplinares.';
      case 'CLINICA':
        return 'Para clínicas consolidadas, policlínicas e centros de saúde.';
      default:
        return 'Recursos completos de gestão clínica e prontuário.';
    }
  };

  const getPlanIcon = (code: string) => {
    switch (code) {
      case 'SOLO':
        return User;
      case 'EQUIPE':
        return Users;
      case 'CLINICA':
        return Building2;
      default:
        return Sparkles;
    }
  };

  return (
    <section className="space-y-6">
      <div className="space-y-1 text-center sm:text-left">
        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Escolha seu plano no Zemda
        </h3>
        <p className="text-xs sm:text-sm text-slate-600">
          Inicie com teste grátis ou escolha a opção sob medida para a sua estrutura.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 items-stretch">
        {plans.map(plan => {
          const isSolo = plan.code === 'SOLO' || plan.trial_days > 0;
          const isSelected = selectedCode === plan.code;
          const PlanIcon = getPlanIcon(plan.code);

          return (
            <article
              key={plan.id}
              onClick={() => onSelectPlan?.(plan)}
              className={`relative rounded-3xl p-5 sm:p-6 flex flex-col h-full min-w-0 cursor-pointer transition-all duration-200 ${
                isSolo
                  ? 'border-2 border-teal-500 bg-gradient-to-b from-teal-50/60 via-white to-white shadow-lg shadow-teal-500/10 ring-2 ring-teal-500/20'
                  : isSelected
                  ? 'border-2 border-slate-800 bg-white shadow-md'
                  : 'border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              {/* Badges de Destaque */}
              <div className="min-h-[28px] mb-2 flex items-center">
                {isSolo ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-teal-600 text-white shadow-xs">
                      <Sparkles className="w-3 h-3 text-teal-200" />
                      7 dias grátis
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200/80">
                      <ShieldCheck className="w-3 h-3 text-teal-600" />
                      Sem cobrança agora
                    </span>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    <PlanIcon className="w-3 h-3 text-slate-500" />
                    Plano Profissional
                  </span>
                )}
              </div>

              {/* Cabeçalho do Plano */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-black text-slate-900 tracking-tight">
                    {plan.name}
                  </h4>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed min-h-[32px]">
                  {getPlanSubtitle(plan.code)}
                </p>
              </div>

              {/* Preço e Periodicidade */}
              <div className="pt-2 pb-1 border-t border-slate-100 mt-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900 tracking-tight font-sans">
                    {plan.monthly_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">
                    {plan.cycle === 'MONTHLY' ? '/mês' : ` / ${plan.cycle}`}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {plan.max_users === 1 ? '1 acesso profissional' : `Até ${plan.max_users} acessos profissionais`}
                  </span>
                </div>
              </div>

              {/* Lista de Recursos Principais */}
              <ul className="text-xs text-slate-600 space-y-2 py-3 border-y border-slate-100 my-2 flex-1">
                {BILLING_BENEFITS.slice(0, 3).map(benefit => (
                  <li key={benefit} className="flex items-start gap-2">
                    <Check className={`w-4 h-4 shrink-0 mt-0.5 ${isSolo ? 'text-teal-600' : 'text-slate-600'}`} />
                    <span className="leading-snug">{benefit}</span>
                  </li>
                ))}
              </ul>

              {/* Microcopy descritivo da forma de ativação */}
              <div className="mb-3">
                {isSolo ? (
                  <p className="text-[11px] text-teal-900 font-medium leading-relaxed bg-teal-50/80 p-2.5 rounded-xl border border-teal-100">
                    Teste gratuito por <strong>7 dias</strong>. Sem compromisso e sem cobrança no cadastro.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    Ativação com pagamento via PIX, Cartão ou Boleto. Dados de faturamento na próxima tela.
                  </p>
                )}
              </div>

              {/* Botão de Ação (CTA) fixado na base do card */}
              <button
                type="button"
                disabled={busy}
                aria-pressed={selectedCode === plan.code}
                onClick={e => {
                  e.stopPropagation();
                  onChoose(plan);
                }}
                className={`mt-auto w-full min-h-[48px] px-4 py-3 rounded-2xl font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 ${
                  isSolo
                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-teal-700/20 active:scale-[0.98]'
                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/10 active:scale-[0.98]'
                }`}
              >
                {busy && selectedCode === plan.code ? (
                  <span>Processando...</span>
                ) : isSolo ? (
                  <>
                    <Sparkles className="w-4 h-4 text-teal-200" />
                    <span>Começar teste grátis (7 dias)</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 text-slate-300" />
                    <span>Contratar agora</span>
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>

      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100">
        <p className="text-[11px] sm:text-xs text-slate-500">
          O módulo clínico é definido pela sua especialidade. Os limites de equipe seguem o plano selecionado.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-teal-700 hover:text-teal-900 disabled:opacity-50 cursor-pointer self-start sm:self-auto py-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
      </div>
    </section>
  );
}
