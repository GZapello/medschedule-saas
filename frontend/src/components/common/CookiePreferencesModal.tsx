import React, { useState, useEffect } from 'react';
import {
  CookieConsentState,
  getStoredCookieConsent,
  saveCookieConsent,
  acceptAllCookies,
  rejectNonEssentialCookies
} from '../../utils/cookieConsent';
import {
  X,
  Cookie,
  ShieldCheck,
  BarChart3,
  Megaphone,
  CheckCircle2,
  Lock
} from 'lucide-react';

interface CookiePreferencesModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const CookiePreferencesModal: React.FC<CookiePreferencesModalProps> = ({
  isOpen: propIsOpen,
  onClose: propOnClose
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [marketingEnabled, setMarketingEnabled] = useState(false);

  // Sincroniza com prop externa se fornecida
  useEffect(() => {
    if (typeof propIsOpen === 'boolean') {
      setIsOpen(propIsOpen);
    }
  }, [propIsOpen]);

  // Escuta evento customizado global para abrir o modal
  useEffect(() => {
    const handleOpen = () => {
      const stored = getStoredCookieConsent();
      if (stored) {
        setAnalyticsEnabled(Boolean(stored.analytics));
        setMarketingEnabled(stored.marketing === true);
      } else {
        setAnalyticsEnabled(false);
        setMarketingEnabled(false);
      }
      setIsOpen(true);
    };

    window.addEventListener('open-cookie-preferences', handleOpen);
    return () => {
      window.removeEventListener('open-cookie-preferences', handleOpen);
    };
  }, []);

  // Inicializa estados ao abrir
  useEffect(() => {
    if (isOpen) {
      const stored = getStoredCookieConsent();
      if (stored) {
        setAnalyticsEnabled(Boolean(stored.analytics));
        setMarketingEnabled(stored.marketing === true);
      } else {
        setAnalyticsEnabled(false);
        setMarketingEnabled(false);
      }
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    if (propOnClose) propOnClose();
  };

  const handleSaveCustom = () => {
    saveCookieConsent({
      analytics: analyticsEnabled,
      marketing: marketingEnabled
    });
    handleClose();
  };

  const handleAcceptAll = () => {
    acceptAllCookies();
    setAnalyticsEnabled(true);
    handleClose();
  };

  const handleRejectAll = () => {
    rejectNonEssentialCookies();
    setAnalyticsEnabled(false);
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200/80 my-8 animate-in fade-in zoom-in-95 duration-200 text-left">
        {/* Header */}
        <div className="bg-slate-50 p-6 text-slate-900 flex items-center justify-between border-b border-slate-200/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200/70 shadow-xs">
              <Cookie className="w-5 h-5" />
            </div>
            <div>
              <h2 id="cookie-modal-title" className="text-lg font-black text-slate-900">
                Preferências de Cookies
              </h2>
              <p className="text-xs text-slate-500">
                Personalize o uso de cookies no Zemda conforme a LGPD
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto text-xs text-slate-600">
          <p className="text-slate-600 leading-relaxed">
            Utilizamos cookies para assegurar o funcionamento da plataforma, analisar o tráfego e, com autorização separada, medir visitas públicas para publicidade. Abaixo, você pode escolher quais categorias deseja autorizar. Suas escolhas podem ser revistas a qualquer momento no rodapé ou no painel de configurações.
          </p>

          {/* Categoria 1: Cookies Necessários */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  1. Cookies Necessários
                </h3>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                <Lock className="w-3 h-3" />
                Sempre Ativos
              </span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Indispensáveis para a autenticação segura de usuários, manutenção de sessão ativa, proteção contra CSRF/ataques cibernéticos, integridade do ambiente multi-tenant e navegação básica. Não podem ser desativados.
            </p>
          </div>

          {/* Categoria 2: Cookies de Análise */}
          <div className="p-4 rounded-2xl border border-slate-200 hover:border-teal-200 transition-colors space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-teal-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  2. Cookies de Análise (Google Analytics)
                </h3>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Cookies de Análise (Google Analytics)"
                  checked={analyticsEnabled}
                  onChange={e => setAnalyticsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
              </label>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Permitem analisar métricas de visitação, tempo de resposta e telas mais acessadas para aprimoramento da performance e estabilidade do sistema. Desativados por padrão até a sua autorização.
            </p>
            <div className="p-3 bg-teal-50/70 border border-teal-100 rounded-xl text-[11px] text-teal-900 leading-relaxed font-medium">
              🛡️ <strong>Privacidade dos registros clínicos:</strong> Nunca transmitimos ao Analytics nome de pacientes, CPF, e-mail, telefone, diagnósticos, anotações de prontuário, medicamentos ou qualquer dado clínico sensível.
            </div>
          </div>

          {/* Categoria 3: Cookies de Marketing / Publicidade */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-slate-400" />
                <h3 className="font-bold text-slate-700 text-sm">
                  3. Cookies de Marketing / Publicidade
                </h3>
              </div>
              <input type="checkbox" aria-label="Cookies de Marketing / Publicidade"
                checked={marketingEnabled} onChange={e => setMarketingEnabled(e.target.checked)}
                className="w-5 h-5 accent-teal-600 cursor-pointer" />
            </div>
            <p className="text-slate-500 leading-relaxed">
              Meta Pixel: com sua autorização, registra visitas às páginas públicas institucionais para medir anúncios e permitir remarketing. A Meta pode receber identificadores do navegador, endereço IP e a URL pública visitada. Não enviamos dados de pacientes, formulários ou informações clínicas. Desativado por padrão; não funciona na área autenticada.
            </p>
          </div>
        </div>

        {/* Footer com botões equilibrados */}
        <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleRejectAll}
            className="px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-700 font-bold text-xs transition-all cursor-pointer text-center shadow-xs"
          >
            Rejeitar não necessários
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={handleSaveCustom}
              className="px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-all cursor-pointer text-center shadow-xs"
            >
              Salvar preferências
            </button>
            <button
              type="button"
              onClick={handleAcceptAll}
              className="px-5 py-2.5 rounded-xl border border-teal-600 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs transition-all cursor-pointer text-center shadow-xs"
            >
              Aceitar todos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
