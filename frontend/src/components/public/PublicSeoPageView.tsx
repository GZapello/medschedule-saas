import React, { useEffect } from 'react';
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
  Stethoscope
} from 'lucide-react';

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
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-teal-500 selection:text-white font-sans antialiased">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-teal-500/15 via-emerald-500/5 to-transparent blur-3xl rounded-full" />
        <div className="absolute top-1/3 -left-64 w-[500px] h-[500px] bg-teal-600/10 blur-3xl rounded-full" />
        <div className="absolute top-2/3 -right-64 w-[600px] h-[600px] bg-indigo-600/10 blur-3xl rounded-full" />
      </div>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div
            onClick={onNavigateHome}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <img
              src="/brand/zemda-icon.png"
              alt="Zemda"
              className="w-10 h-10 object-contain rounded-xl drop-shadow-md group-hover:scale-105 transition-transform"
            />
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
                Zemda
                <span className="inline-block w-2 h-2 rounded-full bg-teal-400" />
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-teal-400">
                Tecnologia em Saúde
              </span>
            </div>
          </div>

          {/* Links para outras seções */}
          <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-400">
            <button onClick={onNavigateHome} className="hover:text-teal-300 transition-colors cursor-pointer">
              Início
            </button>
            <button onClick={() => onNavigatePage('sistema-para-clinicas')} className={`hover:text-teal-300 transition-colors cursor-pointer ${pageData.slug === 'sistema-para-clinicas' ? 'text-teal-400' : ''}`}>
              Clínicas
            </button>
            <button onClick={() => onNavigatePage('sistema-para-medicos')} className={`hover:text-teal-300 transition-colors cursor-pointer ${pageData.slug === 'sistema-para-medicos' ? 'text-teal-400' : ''}`}>
              Médicos
            </button>
            <button onClick={() => onNavigatePage('sistema-para-psicologos')} className={`hover:text-teal-300 transition-colors cursor-pointer ${pageData.slug === 'sistema-para-psicologos' ? 'text-teal-400' : ''}`}>
              Psicólogos
            </button>
            <button onClick={() => onNavigatePage('agenda-online')} className={`hover:text-teal-300 transition-colors cursor-pointer ${pageData.slug === 'agenda-online' ? 'text-teal-400' : ''}`}>
              Agenda Online
            </button>
            <button onClick={() => onNavigatePage('prontuario')} className={`hover:text-teal-300 transition-colors cursor-pointer ${pageData.slug === 'prontuario' ? 'text-teal-400' : ''}`}>
              Prontuário
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={onLogin}
              className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition-all cursor-pointer border border-slate-800"
            >
              Acessar Sistema
            </button>
            <button
              onClick={onNavigateHome}
              className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white rounded-xl shadow-lg shadow-teal-500/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              Conhecer a Plataforma
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-12">
            <div className="max-w-3xl space-y-6">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium justify-center sm:justify-start">
                <span onClick={onNavigateHome} className="hover:text-teal-400 cursor-pointer">Início</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                <span className="text-teal-400 font-bold">{pageData.badge}</span>
              </div>

              {/* Tag / Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                {pageData.badge}
              </div>

              {/* H1 Semântico */}
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
                {pageData.h1}
              </h1>

              {/* H2 Semântico */}
              <h2 className="text-lg sm:text-2xl font-medium text-slate-300 leading-relaxed">
                {pageData.h2}
              </h2>

              {/* Descrição resumida */}
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-2xl">
                {pageData.summary}
              </p>

              {/* Botões de Ação */}
              <div className="pt-4 flex flex-col sm:flex-row items-center gap-4 justify-center sm:justify-start">
                <button
                  onClick={onNavigateHome}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-teal-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  Conhecer a Plataforma
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={onLogin}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-sm transition-all cursor-pointer"
                >
                  Acessar Sistema
                </button>
              </div>

              {/* Selos de Confiança */}
              <div className="pt-4 flex flex-wrap items-center gap-4 text-xs text-slate-400 justify-center sm:justify-start">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-400" />
                  <span>Em conformidade com a LGPD</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-teal-400" />
                  <span>Criptografia de ponta a ponta</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  <span>Alta disponibilidade em nuvem</span>
                </div>
              </div>
            </div>

            {/* Imagem / Card Visual Representativo */}
            <div className="w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="text-[11px] font-mono text-slate-500">zemda.com.br{pageData.path}</span>
              </div>

              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-2xl bg-teal-950/40 border border-teal-800/40 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">Recurso em Destaque</span>
                  <p className="font-bold text-white text-sm">{pageData.features[0]?.title}</p>
                  <p className="text-slate-400 text-xs leading-relaxed">{pageData.features[0]?.description}</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prontuário & Agenda</span>
                  <p className="font-bold text-white text-sm">{pageData.features[1]?.title}</p>
                  <p className="text-slate-400 text-xs leading-relaxed">{pageData.features[1]?.description}</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Plataformas Suportadas</span>
                  <strong className="text-white">Web • Windows • Android</strong>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-bold">
                  v1.1.2 Oficial
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Recursos & Funcionalidades (H3 Semânticos) */}
        <section className="py-16 bg-slate-900/40 border-y border-slate-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-400">
                Funcionalidades Especializadas
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                Tudo o que sua prática em saúde precisa para crescer
              </h2>
              <p className="text-slate-400 text-sm">
                Recursos desenvolvidos em conjunto com especialistas para garantir máxima produtividade clínica e administrativa.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pageData.features.map((feature, idx) => (
                <div
                  key={idx}
                  className="p-6 sm:p-8 rounded-3xl bg-slate-950/80 border border-slate-800/90 hover:border-teal-500/40 transition-all space-y-3 group"
                >
                  <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  {/* H3 Semântico */}
                  <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight group-hover:text-teal-300 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefícios Estruturados */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-teal-950/40 via-slate-900 to-slate-950 border border-teal-500/20 rounded-3xl p-8 sm:p-12 space-y-8">
            <div className="max-w-2xl space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-400">Vantagens Comprovadas</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                Por que escolher o Zemda para a sua gestão clínica?
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pageData.benefits.map((benefit, i) => (
                <div key={i} className="flex items-start gap-3 p-3.5 bg-slate-900/60 rounded-2xl border border-slate-800">
                  <CheckCircle2 className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
                  <span className="text-xs sm:text-sm text-slate-200 font-medium">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Perguntas Frequentes (FAQ) */}
        <section className="py-16 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400">Dúvidas Comuns</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Perguntas Frequentes sobre {pageData.badge}
            </h2>
          </div>

          <div className="space-y-4">
            {pageData.faqs.map((faq, index) => (
              <div key={index} className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
                <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                  <span className="text-teal-400">Q:</span> {faq.question}
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed pl-5">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Call to Action Final */}
        <section className="py-16 bg-gradient-to-b from-slate-950 via-teal-950/20 to-slate-950 border-t border-slate-800/80 text-center px-4">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              {pageData.ctaHeadline}
            </h2>
            <p className="text-sm sm:text-base text-slate-400">
              {pageData.ctaSubheadline}
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onNavigateHome}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-teal-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Conhecer a Plataforma Zemda
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onLogin}
                className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-sm transition-all cursor-pointer"
              >
                Acessar Sistema
              </button>
            </div>
          </div>
        </section>

        {/* Diretório de Links Internos de SEO (Internal Linking Cross-Network) */}
        <section className="py-12 bg-slate-950 border-t border-slate-900 text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block">
              Explore o Ecossistema de Gestão em Saúde Zemda
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {allPagesList.map(p => (
                <button
                  key={p.slug}
                  onClick={() => onNavigatePage(p.slug)}
                  className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                    p.slug === pageData.slug
                      ? 'bg-teal-950/60 border-teal-500/50 text-teal-300 font-bold'
                      : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span className="block text-[11px] truncate">{p.badge}</span>
                  <span className="text-[10px] text-slate-500 truncate block">{p.path}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/90 py-10 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/brand/zemda-icon.png" alt="Zemda" className="w-6 h-6 object-contain" />
            <span>© {new Date().getFullYear()} Zemda Tecnologia em Saúde. Todos os direitos reservados.</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-slate-400">Segurança de Dados LGPD</span>
            <span>•</span>
            <span className="text-slate-400">Disponível para Web, Windows e Android</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
