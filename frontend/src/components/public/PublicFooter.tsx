import React from 'react';
import { openCookiePreferencesModal } from '../../utils/cookieConsent';
import { ArrowUpRight } from 'lucide-react';

export interface PublicFooterProps {
  onLogin?: () => void;
  onRegisterClinic?: () => void;
  onNavigateSeoPage?: (slug: string) => void;
  onNavigateHome?: () => void;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({
  onLogin,
  onRegisterClinic,
  onNavigateSeoPage,
  onNavigateHome
}) => {
  const handleScrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else if (onNavigateHome) {
      onNavigateHome();
    } else {
      window.location.assign(`/#${id}`);
    }
  };

  return (
    <footer className="bg-slate-50 text-slate-600 border-t border-slate-200/80 pt-16 pb-12 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Coluna 1: Marca & Apresentação */}
          <div className="lg:col-span-2 space-y-4">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                if (onNavigateHome) onNavigateHome();
                else window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-3 cursor-pointer select-none group w-fit"
            >
              <img
                src="/brand/zemda-icon.png"
                alt="Zemda"
                className="w-9 h-9 object-contain rounded-xl drop-shadow-xs group-hover:scale-105 transition-transform"
              />
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-2xl font-black tracking-tight text-slate-900">
                    Zemda
                  </span>
                  <span className="inline-block w-2 h-2 rounded-full bg-teal-500" />
                </div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-teal-600">
                  Saúde e Gestão em Harmonia
                </span>
              </div>
            </a>
            <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
              Plataforma especializada de gestão clínica, prontuário eletrônico inteligente, agenda médica, controle financeiro e módulos direcionados para profissionais de saúde.
            </p>
            <div className="pt-2 flex items-center gap-3 text-xs font-semibold text-teal-700">
              <span className="px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200/60">
                100% em conformidade com a LGPD
              </span>
            </div>
          </div>

          {/* Coluna 2: Navegação */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Navegação
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    handleScrollToSection('inicio');
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  Início
                </a>
              </li>
              <li>
                <a
                  href="/#funcionalidades"
                  onClick={(e) => {
                    e.preventDefault();
                    handleScrollToSection('funcionalidades');
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  Funcionalidades
                </a>
              </li>
              <li>
                <a
                  href="/#profissoes"
                  onClick={(e) => {
                    e.preventDefault();
                    handleScrollToSection('profissoes');
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  Áreas profissionais
                </a>
              </li>
              <li>
                <a
                  href="/planos"
                  onClick={(e) => {
                    e.preventDefault();
                    window.history.pushState(null, '', '/planos');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  Planos e Preços
                </a>
              </li>
              <li>
                <a
                  href="/#faq"
                  onClick={(e) => {
                    e.preventDefault();
                    handleScrollToSection('faq');
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  Perguntas Frequentes (FAQ)
                </a>
              </li>
            </ul>
          </div>

          {/* Coluna 3: Áreas Especializadas */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Módulos Profissionais
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="/sistema-para-medicos"
                  onClick={(e) => {
                    if (onNavigateSeoPage) {
                      e.preventDefault();
                      onNavigateSeoPage('sistema-para-medicos');
                    }
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  ZemdaMed — Médicos e Clínicas
                </a>
              </li>
              <li>
                <a
                  href="/sistema-para-fonoaudiologos"
                  onClick={(e) => {
                    if (onNavigateSeoPage) {
                      e.preventDefault();
                      onNavigateSeoPage('sistema-para-fonoaudiologos');
                    }
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  ZemdaFono — Fonoaudiologia
                </a>
              </li>
              <li>
                <a
                  href="/sistema-para-psicopedagogos"
                  onClick={(e) => {
                    if (onNavigateSeoPage) {
                      e.preventDefault();
                      onNavigateSeoPage('sistema-para-psicopedagogos');
                    }
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  ZemdaPP — Psicopedagogia
                </a>
              </li>
              <li>
                <a
                  href="/sistema-para-psicologos"
                  onClick={(e) => {
                    if (onNavigateSeoPage) {
                      e.preventDefault();
                      onNavigateSeoPage('sistema-para-psicologos');
                    }
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  ZemdaPsico — Psicologia
                </a>
              </li>
              <li>
                <a
                  href="/sistema-para-nutricionistas"
                  onClick={(e) => {
                    if (onNavigateSeoPage) {
                      e.preventDefault();
                      onNavigateSeoPage('sistema-para-nutricionistas');
                    }
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  ZemdaNutri — Nutrição
                </a>
              </li>
              <li>
                <a
                  href="/sistema-para-fisioterapeutas"
                  onClick={(e) => {
                    if (onNavigateSeoPage) {
                      e.preventDefault();
                      onNavigateSeoPage('sistema-para-fisioterapeutas');
                    }
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  ZemdaFisio — Fisioterapia
                </a>
              </li>
              <li>
                <a
                  href="/#profissoes"
                  onClick={(e) => {
                    e.preventDefault();
                    handleScrollToSection('profissoes');
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  ZemdaTO — Terapia Ocupacional
                </a>
              </li>
              <li>
                <a
                  href="/#profissoes"
                  onClick={(e) => {
                    e.preventDefault();
                    handleScrollToSection('profissoes');
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  ZemdaPersonal — Educ. Física
                </a>
              </li>
              <li>
                <a
                  href="/#profissoes"
                  onClick={(e) => {
                    e.preventDefault();
                    handleScrollToSection('profissoes');
                  }}
                  className="hover:text-teal-600 transition-colors cursor-pointer block"
                >
                  ZemdaOdonto — Odontologia
                </a>
              </li>
              <li>
                <a
                  href="/#zemdabody"
                  onClick={(e) => {
                    e.preventDefault();
                    handleScrollToSection('zemdabody');
                  }}
                  className="hover:text-teal-600 font-medium transition-colors cursor-pointer block"
                >
                  ZemdaBody — Avaliação Corporal
                </a>
              </li>
            </ul>
          </div>

          {/* Coluna 4: Jurídico & Acesso */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Privacidade & Jurídico
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="/termos-de-uso"
                  className="hover:text-teal-600 transition-colors flex items-center gap-1"
                >
                  Termos de Uso
                </a>
              </li>
              <li>
                <a
                  href="/privacidade"
                  className="hover:text-teal-600 transition-colors flex items-center gap-1"
                >
                  Política de Privacidade / LGPD
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={openCookiePreferencesModal}
                  className="hover:text-teal-600 transition-colors cursor-pointer text-left"
                >
                  Preferências de Cookies
                </button>
              </li>
              <li className="pt-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900 block mb-1">
                  Acesso
                </span>
                {onLogin && (
                  <button
                    type="button"
                    onClick={onLogin}
                    className="hover:text-teal-600 transition-colors cursor-pointer block"
                  >
                    Entrar na plataforma
                  </button>
                )}
                {onRegisterClinic && (
                  <button
                    type="button"
                    onClick={onRegisterClinic}
                    className="hover:text-teal-600 transition-colors cursor-pointer block mt-1"
                  >
                    Cadastrar clínica
                  </button>
                )}
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            © {new Date().getFullYear()} Zemda — Tecnologia em Saúde. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Plataforma disponível para Web e Desktop
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
