import React, { useState, useEffect } from 'react';
import {
  CookieConsentState,
  getStoredCookieConsent,
  acceptAllCookies,
  rejectNonEssentialCookies,
  openCookiePreferencesModal
} from '../../utils/cookieConsent';
import { ShieldCheck, Cookie, Settings } from 'lucide-react';

export const CookieBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Se ainda não houver escolha de consentimento registrada
    const existing = getStoredCookieConsent();
    if (!existing) {
      setIsVisible(true);
    }

    const handleConsentChanged = (e: Event) => {
      const consent = (e as CustomEvent<CookieConsentState>).detail;
      if (consent) {
        setIsVisible(false);
      }
    };

    window.addEventListener('zemda-cookie-consent-changed', handleConsentChanged);
    return () => {
      window.removeEventListener('zemda-cookie-consent-changed', handleConsentChanged);
    };
  }, []);

  if (!isVisible) return null;

  const handleAcceptAll = () => {
    acceptAllCookies();
    setIsVisible(false);
  };

  const handleRejectNonEssential = () => {
    rejectNonEssentialCookies();
    setIsVisible(false);
  };

  const handleCustomize = () => {
    openCookiePreferencesModal();
  };

  return (
    <div
      role="region"
      aria-label="Consentimento de Cookies"
      className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6 pointer-events-none"
    >
      <div className="max-w-4xl mx-auto bg-white/95 backdrop-blur-md text-slate-700 border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-slate-900/10 pointer-events-auto transition-all animate-in fade-in slide-in-from-bottom-6 duration-300">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/70">
                <Cookie className="w-4 h-4" />
              </div>
              <span>Sua Privacidade e Gestão de Cookies — LGPD</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              O Zemda utiliza cookies necessários para autenticação, segurança e funcionamento regular da plataforma. Com o seu consentimento, utilizamos cookies de análise (Google Analytics de métricas de uso). <strong>Nunca coletamos ou enviamos ao Analytics dados clínicos, prontuários ou informações pessoais sensíveis.</strong> Com autorização de marketing, o Meta Pixel registra visitas públicas e identificadores do navegador para mensuração de anúncios e remarketing, sem dados clínicos. Você pode personalizar suas escolhas ou alterá-las a qualquer momento.
            </p>
            <div className="flex items-center gap-3 text-[11px] text-teal-700 pt-0.5 font-medium">
              <a
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Política de Privacidade
              </a>
              <span className="text-slate-300">•</span>
              <a
                href="/termos-de-uso"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Termos de Uso
              </a>
            </div>
          </div>

          {/* Botões com equilíbrio visual conforme a LGPD */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={handleCustomize}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Personalizar</span>
            </button>

            <button
              type="button"
              onClick={handleRejectNonEssential}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold transition-all cursor-pointer text-center"
            >
              Rejeitar não necessários
            </button>

            <button
              type="button"
              onClick={handleAcceptAll}
              className="px-5 py-2.5 rounded-xl border border-teal-600 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-bold shadow-md shadow-teal-600/25 transition-all cursor-pointer text-center"
            >
              Aceitar todos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
