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
        setMarketingEnabled(false);
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
        setMarketingEnabled(false);
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
      marketing: false
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100 my-8 animate-in fade-in zoom-in-95 duration-200 text-left">
        {/* Header */}
        <div className="bg-slate-900 p-6 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
              <Cookie className="w-5 h-5" />
            </div>
            <div>
              <h2 id="cookie-modal-title" className="text-lg font-bold text-white">
                Preferências de Cookies
              </h2>
              <p className="text-xs text-slate-400">
                Personalize o uso de cookies no Zemda conforme a LGPD
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto text-xs text-slate-600">
          <p className="text-slate-700 leading-relaxed">
            Utilizamos cookies para assegurar o funcionamento da plataforma e compreender o tráfego técnico de forma anônima. Abaixo, você pode escolher quais categorias deseja autorizar. Suas escolhas podem ser revistas a qualquer momento no rodapé ou no painel de configurações.
          </p>

          {/* Categoria 1: Cookies Necessários */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
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
          <div className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 transition-colors space-y-3">
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
                  checked={analyticsEnabled}
                  onChange={e => setAnalyticsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
              </label>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Permitem analisar métricas anônimas de visitação, tempo de resposta e telas mais acessadas para aprimoramento da performance e estabilidade do sistema. Desativados por padrão até a sua autorização.
            </p>
            <div className="p-3 bg-teal-50/70 border border-teal-100 rounded-xl text-[11px] text-teal-900 leading-relaxed font-medium">
              🛡️ <strong>Garantia de Privacidade Médica e LGPD:</strong> Nunca transmitimos ao Analytics nome de pacientes, CPF, e-mail, telefone, diagnósticos, anotações de prontuário, medicamentos ou qualquer dado clínico sensível.
            </div>
          </div>

          {/* Categoria 3: Cookies de Marketing / Publicidade */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 opacity-85 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-slate-400" />
                <h3 className="font-bold text-slate-700 text-sm">
                  3. Cookies de Marketing / Publicidade
                </h3>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-0.5 rounded-md bg-slate-100">
                Inativo
              </span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              O Zemda não veicula anúncios comerciais nem compartilha perfis para fins de remarketing publicitário dentro da plataforma. Esta categoria permanece desativada.
            </p>
          </div>
        </div>

        {/* Footer com botões sem contraste manipulativo */}
        <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleRejectAll}
            className="px-4 py-2.5 rounded-xl border border-slate-300 hover:border-slate-400 bg-white text-slate-700 font-bold text-xs transition-all cursor-pointer text-center"
          >
            Rejeitar não necessários
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={handleSaveCustom}
              className="px-5 py-2.5 rounded-xl border border-slate-800 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-all cursor-pointer text-center shadow-xs"
            >
              Salvar preferências
            </button>
            <button
              type="button"
              onClick={handleAcceptAll}
              className="px-5 py-2.5 rounded-xl border border-teal-600 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-all cursor-pointer text-center shadow-xs"
            >
              Aceitar todos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
