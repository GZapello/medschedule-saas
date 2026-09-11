import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, Server, CheckCircle2, AlertCircle } from 'lucide-react';
import { ApiClient } from '../../api/client';

export const NetworkOfflineModal: React.FC = () => {
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [serverUrl, setServerUrl] = useState<string>('');
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);

  useEffect(() => {
    // Carrega a URL configurada atual
    const currentBase = ApiClient.getBaseUrl();
    setServerUrl(currentBase);

    // Monitora eventos de status online/offline do navegador
    const handleOnline = () => {
      // Ao voltar a conexão do navegador, tenta testar a API
      checkServerHealth();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    // Monitora evento disparado pelo ApiClient em caso de falha de conexão de rede
    const handleConnectionError = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('saas-network-error', handleConnectionError);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('saas-network-error', handleConnectionError);
    };
  }, []);

  const safeFetchWithTimeout = async (url: string, timeoutMs = 4000): Promise<Response> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'GET', signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  };

  const checkServerHealth = async () => {
    setIsRetrying(true);
    setConfigFeedback(null);
    try {
      const baseUrl = ApiClient.getBaseUrl().replace(/\/api$/, '');
      const res = await safeFetchWithTimeout(`${baseUrl}/health`, 4000);
      if (res.ok) {
        setIsOffline(false);
      } else {
        setIsOffline(true);
      }
    } catch {
      setIsOffline(true);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSaveServerUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverUrl.trim()) return;

    ApiClient.setCustomBaseUrl(serverUrl.trim());
    setConfigFeedback('Testando conexão com o novo endereço...');
    setIsRetrying(true);

    try {
      const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
      const healthUrl = cleanUrl.endsWith('/api') ? cleanUrl.replace(/\/api$/, '/health') : `${cleanUrl}/health`;
      const res = await safeFetchWithTimeout(healthUrl, 4000);
      if (res.ok) {
        setConfigFeedback('Conexão estabelecida com sucesso!');
        setTimeout(() => {
          setIsOffline(false);
          setShowConfig(false);
          window.location.reload();
        }, 800);
      } else {
        setConfigFeedback('Servidor respondeu, mas retornou status inesperado.');
      }
    } catch {
      setConfigFeedback('Não foi possível alcançar este endereço. Verifique o IP e porta.');
    } finally {
      setIsRetrying(false);
    }
  };

  if (!isOffline) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 text-center space-y-4 animate-in fade-in zoom-in duration-200">
        <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center shadow-xs">
          <WifiOff className="w-7 h-7" />
        </div>

        <div className="space-y-1">
          <h3 className="text-lg font-bold text-slate-900">
            Sem Conexão com o Servidor
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={checkServerHealth}
            disabled={isRetrying}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Verificando conexão...' : 'Tentar Novamente'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="text-xs font-semibold text-slate-500 hover:text-indigo-600 py-1 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Server className="w-3.5 h-3.5" />
            <span>{showConfig ? 'Ocultar configurações de rede' : 'Configurar endereço do servidor da clínica'}</span>
          </button>
        </div>

        {/* Configuração opcional de IP do servidor para dispositivos na rede Wi-Fi da clínica */}
        {showConfig && (
          <form onSubmit={handleSaveServerUrl} className="pt-3 border-t border-slate-100 text-left space-y-2.5 animate-in fade-in duration-150">
            <label className="block text-2xs font-bold text-slate-700 uppercase tracking-wider">
              URL da API do Servidor (ex: IP local da clínica)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://192.168.0.100:4000/api"
                className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-mono"
              />
              <button
                type="submit"
                disabled={isRetrying}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Salvar
              </button>
            </div>
            {configFeedback && (
              <p className="text-2xs text-indigo-600 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {configFeedback}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
