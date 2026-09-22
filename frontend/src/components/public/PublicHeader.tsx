import React, { useState } from 'react';
import { Menu, X, ChevronRight } from 'lucide-react';

export interface PublicHeaderProps {
  onLogin?: () => void;
  onRegisterClinic?: () => void;
  activeSection?: string;
  isLegalOrAuxiliary?: boolean;
  onNavigateHome?: () => void;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  onLogin,
  onRegisterClinic,
  activeSection,
  isLegalOrAuxiliary = false,
  onNavigateHome
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    setMobileMenuOpen(false);
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    // Keep real hrefs for auxiliary pages, direct links and new tabs.
    if (isLegalOrAuxiliary || window.location.pathname !== '/') return;
    const anchorId = href.startsWith('/#') ? href.slice(2) : href === '/' ? 'inicio' : null;
    const target = anchorId ? document.getElementById(anchorId) : null;
    if (target) {
      event.preventDefault();
      window.history.pushState(null, '', href);
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  };

  const navLinks = [
    { label: 'Produto', href: '/#produto' },
    { label: 'Módulos', href: '/#profissoes' },
    { label: 'Funcionalidades', href: '/#funcionalidades' },
    { label: 'Planos', href: '/planos' },
    { label: 'Segurança', href: '/#seguranca' }
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100/90 shadow-xs transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo & Name (Link HTML Rastreável) */}
        <a
          href="/"
          onClick={(e) => {
            handleNavClick(e, '/');
          }}
          className="flex items-center gap-3 cursor-pointer group select-none"
        >
          <div className="relative flex items-center justify-center">
            <img
              src="/brand/zemda-icon-96.webp"
              alt="Zemda"
              width={36} height={36}
              className="w-9 h-9 object-contain rounded-xl drop-shadow-xs group-hover:scale-105 transition-transform"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-black tracking-tight text-slate-900">
                Zemda
              </span>
              <span className="inline-block w-2 h-2 rounded-full bg-teal-500" />
            </div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-teal-600">
              Saúde e Gestão
            </span>
          </div>
        </a>

        {/* Desktop Navigation Links (Links HTML Rastreáveis) */}
        <nav className="hidden lg:flex items-center gap-7 text-xs font-semibold text-slate-600">
          {navLinks.map(link => {
            const isActive = activeSection === link.href.replace(/^\/?#/, '');
            return (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => {
                  handleNavClick(e, link.href);
                }}
                className={`hover:text-teal-600 transition-colors py-1 cursor-pointer font-medium ${
                  isActive ? 'text-teal-600 font-bold' : ''
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        {/* Action Buttons: Entrar & Começar agora */}
        <div className="hidden lg:flex items-center gap-3">
          {onLogin && (
            <button
              type="button"
              onClick={onLogin}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-teal-600 rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
            >
              Entrar
            </button>
          )}
          {onRegisterClinic && (
            <button
              type="button"
              onClick={onRegisterClinic}
              className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 rounded-xl shadow-md shadow-teal-600/20 hover:shadow-lg hover:shadow-teal-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Começar agora</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex lg:hidden items-center gap-2">
          {onRegisterClinic && (
            <button
              type="button"
              onClick={onRegisterClinic}
              className="px-3.5 py-2 text-[11px] font-bold text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-all"
            >
              Começar
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="public-mobile-menu"
            onKeyDown={(event) => { if (event.key === 'Escape') setMobileMenuOpen(false); }}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu (Links HTML Rastreáveis) */}
      {mobileMenuOpen && (
        <div id="public-mobile-menu" onKeyDown={(event) => { if (event.key === 'Escape') setMobileMenuOpen(false); }} className="lg:hidden border-t border-slate-100 bg-white/95 backdrop-blur-md px-4 pt-3 pb-6 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col space-y-2">
            {navLinks.map(link => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => {
                  handleNavClick(e, link.href);
                }}
                className="text-left px-3 py-2 text-sm font-medium text-slate-700 hover:text-teal-600 hover:bg-teal-50/50 rounded-lg transition-colors cursor-pointer block"
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            {onLogin && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogin();
                }}
                className="w-full py-2.5 text-center text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Entrar
              </button>
            )}
            {onRegisterClinic && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onRegisterClinic();
                }}
                className="w-full py-2.5 text-center text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                <span>Começar agora</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
