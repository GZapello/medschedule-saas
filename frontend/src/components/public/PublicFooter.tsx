import React from 'react';
import { openCookiePreferencesModal } from '../../utils/cookieConsent';
import { LANDING_MODULES, moduleHref } from '../../../../backend/src/seo/landingContent';

export interface PublicFooterProps {
  onLogin?: () => void;
  onRegisterClinic?: () => void;
  onNavigateSeoPage?: (slug: string) => void;
  onNavigateHome?: () => void;
}
export const PublicFooter: React.FC<PublicFooterProps> = ({ onLogin, onRegisterClinic, onNavigateSeoPage }) => {
  const linkClass = 'block py-1.5 text-xs leading-relaxed text-slate-600 hover:text-teal-700 transition-colors';
  const titleClass = 'text-xs font-bold text-slate-800 mb-4';
  return <footer className="bg-slate-50 border-t border-slate-200/80 text-slate-600 py-14">
    <div className="max-w-7xl mx-auto px-5 sm:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-10 mb-10 border-b border-slate-200">
        <a href="/" className="flex items-center gap-3 w-fit"><img src="/brand/zemda-icon.png" alt="" width="36" height="36" loading="lazy" /><span><span className="block text-2xl font-black tracking-tight text-slate-900">Zemda</span><span className="text-[10px] uppercase tracking-widest font-bold text-teal-700">Saúde e Gestão</span></span></a>
        <p className="max-w-md text-xs leading-relaxed">Gestão e atendimento em saúde para profissionais autônomos, consultórios e clínicas. Ferramentas especializadas para cada profissão.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-7 gap-y-9">
        <div><h2 className={titleClass}>Produto</h2><a className={linkClass} href="/#produto">Conheça o Zemda</a><a className={linkClass} href="/#como-funciona">Como funciona</a><a className={linkClass} href="/#funcionalidades">Funcionalidades</a><a className={linkClass} href="/planos">Planos e valores</a><a className={linkClass} href="/#seguranca">Segurança</a></div>
        <div><h2 className={titleClass}>Módulos</h2>{LANDING_MODULES.map(module => <a key={module.id} href={moduleHref(module)} className={linkClass} onClick={event => { if (module.slug && onNavigateSeoPage && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onNavigateSeoPage(module.slug); } }}>{module.name}</a>)}<a className={linkClass} href="/#zemdabody">ZemdaBody · transversal</a></div>
        <div><h2 className={titleClass}>Empresa &amp; conteúdo</h2><a className={linkClass} href="/blog">Conteúdos Zemda</a><a className={linkClass} href="/agenda-online">Agenda online</a><a className={linkClass} href="/prontuario">Prontuário eletrônico</a><a className={linkClass} href="/gestao-financeira">Gestão financeira</a><a className={linkClass} href="/#faq">Perguntas frequentes</a></div>
        <div><h2 className={titleClass}>Privacidade &amp; jurídico</h2><a className={linkClass} href="/privacidade">Privacidade e LGPD</a><a className={linkClass} href="/termos-de-uso">Termos de uso</a><button type="button" className={`${linkClass} text-left`} onClick={openCookiePreferencesModal}>Preferências de cookies</button></div>
        <div><h2 className={titleClass}>Acesso</h2>{onLogin ? <button className={linkClass} onClick={onLogin}>Entrar no Zemda</button> : <a className={linkClass} href="/login">Entrar no Zemda</a>}{onRegisterClinic ? <button className={linkClass} onClick={onRegisterClinic}>Cadastrar clínica</button> : <a className={linkClass} href="/login">Cadastrar clínica</a>}</div>
      </div>
      <p className="text-[11px] text-slate-500 border-t border-slate-200 pt-7 mt-10">© {new Date().getFullYear()} Zemda — Tecnologia em Saúde. Todos os direitos reservados.</p>
    </div>
  </footer>;
};
