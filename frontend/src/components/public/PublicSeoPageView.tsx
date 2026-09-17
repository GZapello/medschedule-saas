import React, { useEffect } from 'react';
import { openCookiePreferencesModal } from '../../utils/cookieConsent';
import { SeoPageData, SEO_PAGES } from '../../data/seoPagesData';
import {
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Calendar,
  FileText,
  DollarSign,
  ChevronRight,
  Sparkles,
  Award,
  Users,
  Building2,
  Lock,
  Download,
  Stethoscope,
  Laptop
} from 'lucide-react';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';

interface PublicSeoPageViewProps {
  pageData: SeoPageData;
  onNavigateHome: () => void;
  onNavigatePage: (slug: string) => void;
  onLogin: () => void;
  onRegisterClinic: () => void;
}

export const PublicSeoPageView: React.FC<PublicSeoPageViewProps> = ({
  pageData,
  onNavigateHome,
  onNavigatePage,
  onLogin,
  onRegisterClinic
}) => {
  // Atualiza metatags dinamicamente no navegador
  useEffect(() => {
    document.title = pageData.title;

    let descMeta = document.querySelector('meta[name="description"]');
    if (!descMeta) {
      descMeta = document.createElement('meta');
      descMeta.setAttribute('name', 'description');
      document.head.appendChild(descMeta);
    }
    descMeta.setAttribute('content', pageData.metaDescription);

    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', `https://zemda.com.br${pageData.path}`);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pageData]);

  const allPagesList = Object.values(SEO_PAGES);

  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-800 selection:bg-teal-500 selection:text-white font-sans antialiased flex flex-col justify-between">
      <div>
        {/* Top Header Unificado */}
        <PublicHeader
          onLogin={onLogin}
          onRegisterClinic={onRegisterClinic}
          isLegalOrAuxiliary={true}
          onNavigateHome={onNavigateHome}
        />

        {/* Main Content Area */}
        <main className="relative z-10">
          {/* Hero Section */}
          <section className="pt-12 pb-16 sm:pt-16 sm:pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center sm:text-left">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
              <div className="max-w-3xl space-y-6">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium justify-center sm:justify-start">
                  <a
                    href="/"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateHome();
                    }}
                    className="hover:text-teal-600 cursor-pointer"
                  >
                    Início
                  </a>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-teal-700 font-bold">{pageData.badge}</span>
                </div>

                {/* Tag / Badge */}
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-bold uppercase tracking-wider shadow-xs">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>{pageData.badge}</span>
                </div>

                {/* H1 Semântico */}
                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-950 leading-tight">
                  {pageData.h1}
                </h1>

                {/* H2 Semântico */}
                <h2 className="text-lg sm:text-2xl font-medium text-slate-600 leading-relaxed">
                  {pageData.h2}
                </h2>

                {/* Descrição resumida */}
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
                  {pageData.summary}
                </p>

                {/* Botões de Ação */}
                <div className="pt-4 flex flex-col sm:flex-row items-center gap-4 justify-center sm:justify-start">
                  <button
                    type="button"
                    onClick={onRegisterClinic}
                    className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-sm shadow-lg shadow-teal-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Começar agora</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onLogin}
                    className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-sm shadow-xs transition-all cursor-pointer"
                  >
                    Acessar Sistema
                  </button>
                </div>

                {/* Selos de Confiança */}
                <div className="pt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500 justify-center sm:justify-start">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-600" />
                    <span>Em conformidade com a LGPD</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-teal-600" />
                    <span>Criptografia de ponta a ponta</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    <span>Alta disponibilidade em nuvem</span>
                  </div>
                </div>
              </div>

              {/* Card Visual Representativo */}
              <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">zemda.com.br{pageData.path}</span>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-100 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Recurso em Destaque</span>
                    <p className="font-bold text-slate-900 text-sm">{pageData.features[0]?.title}</p>
                    <p className="text-slate-600 text-xs leading-relaxed">{pageData.features[0]?.description}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Prontuário & Agenda</span>
                    <p className="font-bold text-slate-900 text-sm">{pageData.features[1]?.title}</p>
                    <p className="text-slate-600 text-xs leading-relaxed">{pageData.features[1]?.description}</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Plataformas Suportadas</span>
                    <strong className="text-slate-900 font-semibold">Web e Desktop</strong>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-700 font-mono text-[10px] font-bold">
                    v1.1.2 Oficial
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Recursos & Funcionalidades (H3 Semânticos) */}
          <section className="py-16 bg-white border-y border-slate-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
                <span className="text-xs font-bold uppercase tracking-widest text-teal-600">
                  Funcionalidades Especializadas
                </span>
                <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                  Tudo o que sua prática em saúde precisa para crescer
                </h2>
                <p className="text-slate-600 text-sm">
                  Recursos desenvolvidos em conjunto com especialistas para garantir máxima produtividade clínica e administrativa.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pageData.features.map((feature, idx) => (
                  <div
                    key={idx}
                    className="p-6 sm:p-8 rounded-3xl bg-[#fafbfc] border border-slate-200/80 hover:border-teal-300 transition-all space-y-3 group shadow-xs hover:shadow-md"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200/70 flex items-center justify-center text-teal-700 group-hover:scale-110 transition-transform">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight group-hover:text-teal-700 transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Benefícios Estruturados */}
          <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-gradient-to-r from-teal-50 via-emerald-50/40 to-teal-50 border border-teal-200/80 rounded-3xl p-8 sm:p-12 space-y-8 shadow-xs">
              <div className="max-w-2xl space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-700">Vantagens Comprovadas</span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  Por que escolher o Zemda para a sua gestão clínica?
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pageData.benefits.map((benefit, i) => (
                  <div key={i} className="flex items-start gap-3 p-3.5 bg-white rounded-2xl border border-teal-100 shadow-xs">
                    <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Perguntas Frequentes (FAQ) */}
          <section className="py-16 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="text-center space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-600">Dúvidas Comuns</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Perguntas Frequentes sobre {pageData.badge}
              </h2>
            </div>

            <div className="space-y-4">
              {pageData.faqs.map((faq, index) => (
                <div key={index} className="p-6 rounded-2xl bg-white border border-slate-200/80 space-y-2 shadow-xs">
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                    <span className="text-teal-600">Q:</span> {faq.question}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pl-5">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Call to Action Final */}
          <section className="py-16 bg-white border-t border-slate-100 text-center px-4">
            <div className="max-w-3xl mx-auto space-y-6">
              <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
                {pageData.ctaHeadline}
              </h2>
              <p className="text-sm sm:text-base text-slate-600">
                {pageData.ctaSubheadline}
              </p>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={onRegisterClinic}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-sm shadow-xl shadow-teal-600/25 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Começar agora</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onLogin}
                  className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-sm transition-all cursor-pointer shadow-xs"
                >
                  Acessar Sistema
                </button>
              </div>
            </div>
          </section>

          {/* Diretório de Links Internos de SEO */}
          <section className="py-12 bg-slate-50 border-t border-slate-200/80 text-xs text-slate-500">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700 block">
                Explore o Ecossistema de Gestão em Saúde Zemda
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {allPagesList.map(p => (
                  <a
                    key={p.slug}
                    href={p.path}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigatePage(p.slug);
                    }}
                    className={`text-left p-3 rounded-2xl border transition-all cursor-pointer block ${
                      p.slug === pageData.slug
                        ? 'bg-teal-50 border-teal-300 text-teal-900 font-bold shadow-xs'
                        : 'bg-white border-slate-200/80 text-slate-600 hover:text-teal-700 hover:border-teal-200 shadow-xs'
                    }`}
                  >
                    <span className="block text-[11px] truncate">{p.badge}</span>
                    <span className="text-[10px] text-slate-400 truncate block">{p.path}</span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Footer Unificado */}
      <PublicFooter
        onLogin={onLogin}
        onRegisterClinic={onRegisterClinic}
        onNavigateSeoPage={onNavigatePage}
        onNavigateHome={onNavigateHome}
      />
    </div>
  );
};
