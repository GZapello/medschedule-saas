import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { APP_VERSION, compareVersions, VersionInfo } from '../../config/version';
import { ArrowDownToLine, Sparkles, X, CheckCircle2, ShieldCheck } from 'lucide-react';

export const UpdateNotificationModal: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);

  useEffect(() => {
    // Verifica se o usuário já dispensou o aviso nesta sessão
    const dismissedSession = sessionStorage.getItem('zemda_update_dismissed');
    if (dismissedSession) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await ApiClient.get<VersionInfo>('/v1/public/app-version');
        if (res && res.latestVersion) {
          setVersionInfo(res);
          // Se a versão retornada pelo servidor for superior à instalada localmente
          if (compareVersions(res.latestVersion, APP_VERSION) > 0) {
            setUpdateAvailable(true);
          }
        }
      } catch (_) {
        // Falha silenciosa se o servidor estiver offline
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  if (!updateAvailable || isDismissed || !versionInfo) {
    return null;
  }

  const isAndroid = typeof window !== 'undefined' && (
    (window as any).Capacitor?.isNativePlatform?.() ||
    (window as any).Capacitor?.getPlatform?.() === 'android' ||
    navigator.userAgent.toLowerCase().includes('android')
  );

  const handleUpdateNow = () => {
    setDownloading(true);
    const baseUrl = ApiClient.getBaseUrl();
    const downloadEndpoint = isAndroid
      ? `${baseUrl}/v1/public/download-android`
      : `${baseUrl}/v1/public/download-windows`;

    // Dispara o download diretamente no navegador / WebView
    window.location.href = downloadEndpoint;

    setTimeout(() => {
      setDownloading(false);
    }, 4000);
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('zemda_update_dismissed', 'true');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
        
        {/* Header com ícone e badge */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                  Nova Versão {versionInfo.latestVersion}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  (Atual: v{APP_VERSION})
                </span>
              </div>
              <h3 className="font-bold text-slate-900 text-lg leading-tight mt-1">
                Atualização do Zemda Disponível
              </h3>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Detalhes da Atualização */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2 text-sm text-slate-600">
          <p className="font-medium text-slate-800">
            {versionInfo.releaseNotes || 'Uma nova versão do sistema está pronta para instalação.'}
          </p>
          <div className="pt-2 border-t border-slate-200/60 space-y-1.5 text-xs text-slate-500">
            <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Instalação automática sobre a versão atual</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>Preservação total de dados, configurações e sessões</span>
            </div>
          </div>
        </div>

        {/* Informações da plataforma detectada */}
        <div className="text-xs text-slate-500 text-center">
          Plataforma detectada: <strong className="text-slate-700">{isAndroid ? 'Zemda Android (APK)' : 'Zemda Windows (.exe)'}</strong>
        </div>

        {/* Ações */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 py-2.5 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors text-center order-2 sm:order-1"
          >
            Lembrar mais tarde
          </button>
          <button
            type="button"
            onClick={handleUpdateNow}
            disabled={downloading}
            className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 rounded-xl shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 transition-all active:scale-98 order-1 sm:order-2 disabled:opacity-75"
          >
            <ArrowDownToLine className={`w-4 h-4 ${downloading ? 'animate-bounce' : ''}`} />
            <span>{downloading ? 'Iniciando download...' : 'Atualizar agora'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
