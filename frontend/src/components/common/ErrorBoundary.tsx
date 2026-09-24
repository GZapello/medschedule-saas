import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Server, CheckCircle2, Sparkles } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { isChunkLoadError, triggerChunkRecovery, clearTechnicalAssetCaches } from '../../utils/chunkRecovery';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  serverUrl: string;
  isTesting: boolean;
  testResult: string | null;
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    serverUrl: ApiClient.getBaseUrl(),
    isTesting: false,
    testResult: null,
    isChunkError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    const isChunk = isChunkLoadError(error);
    return {
      hasError: true,
      error,
      serverUrl: ApiClient.getBaseUrl(),
      isTesting: false,
      testResult: null,
      isChunkError: isChunk
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);

    // Se for falha de chunk dinâmico após novo deploy, tenta recuperação automática imediata
    if (isChunkLoadError(error)) {
      triggerChunkRecovery('ErrorBoundary.componentDidCatch');
    }
  }

  /**
   * Recarrega a aplicação com cache-busting preservando a rota atual
   */
  private handleReloadWithCacheBusting = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('__zemda_refresh', String(Date.now()));
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  };

  private handleSaveServerUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = this.state.serverUrl.trim();
    if (!cleanUrl) return;

    ApiClient.setCustomBaseUrl(cleanUrl);
    this.setState({ isTesting: true, testResult: 'Testando conexão...' });

    const healthUrl = cleanUrl.endsWith('/api') ? cleanUrl.replace(/\/api$/, '/health') : `${cleanUrl}/health`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(healthUrl, { method: 'GET', signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        this.setState({ isTesting: false, testResult: 'Conexão bem sucedida! Reiniciando aplicativo...' });
        setTimeout(() => {
          this.handleReloadWithCacheBusting();
        }, 1000);
      } else {
        this.setState({ isTesting: false, testResult: `Servidor retornou status ${res.status}.` });
      }
    } catch {
      this.setState({
        isTesting: false,
        testResult: 'Não foi possível conectar ao servidor neste endereço.'
      });
    }
  };

  /**
   * Limpa estritamente caches técnicos (CacheStorage).
   * NUNCA limpa localStorage (preserva auth_token, sessão, tenant e preferências).
   */
  private handleClearCache = async () => {
    try {
      // Limpa CacheStorage de assets estáticos
      await clearTechnicalAssetCaches();
      // Remove trava de cooldown para permitir nova tentativa limpa
      try {
        sessionStorage.removeItem('zemda_chunk_recovery');
      } catch {}
      // Recarrega com cache-busting preservando a rota
      this.handleReloadWithCacheBusting();
    } catch (e) {
      console.error('[ErrorBoundary.handleClearCache] Erro:', e);
      this.handleReloadWithCacheBusting();
    }
  };

  public render() {
    if (this.state.hasError) {
      const { isChunkError, error } = this.state;

      // ----------------------------------------------------
      // CASO 1: Erro de Chunk / Dynamic Import pós-deploy
      // NÃO exibe configuração de servidor (pois o servidor está online).
      // ----------------------------------------------------
      if (isChunkError) {
        return (
          <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 text-center animate-in fade-in">
              <div className="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-2xl mx-auto flex items-center justify-center">
                <Sparkles className="w-8 h-8 animate-pulse" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-bold text-white">Nova Versão do Zemda Disponível</h2>
                <p className="text-xs text-slate-300">
                  Uma nova versão do sistema foi publicada enquanto o aplicativo estava aberto. Não foi possível carregar o módulo solicitado da versão anterior.
                </p>
              </div>

              {error && (
                <div className="bg-slate-950/80 rounded-xl p-3 text-left border border-slate-700/60 overflow-x-auto text-2xs font-mono text-indigo-300 max-h-24">
                  {error.message || String(error)}
                </div>
              )}

              <p className="text-2xs text-slate-400">
                Sua sessão, login e dados permanecem 100% seguros e preservados.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={this.handleReloadWithCacheBusting}
                  className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tentar novamente</span>
                </button>

                <button
                  type="button"
                  onClick={this.handleClearCache}
                  className="py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Limpar Cache</span>
                </button>
              </div>
            </div>
          </div>
        );
      }

      // ----------------------------------------------------
      // CASO 2: Falha geral / Conexão de servidor
      // ----------------------------------------------------
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 text-center animate-in fade-in">
            <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-2xl mx-auto flex items-center justify-center">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white">Falha ao Carregar Interface</h2>
              <p className="text-xs text-slate-300">
                Ocorreu uma falha inesperada na renderização. Você pode tentar recarregar ou ajustar o endereço do servidor Zemda.
              </p>
            </div>

            {error && (
              <div className="bg-slate-950/80 rounded-xl p-3 text-left border border-slate-700/60 overflow-x-auto text-2xs font-mono text-rose-300 max-h-28">
                {error.message || String(error)}
              </div>
            )}

            <form onSubmit={this.handleSaveServerUrl} className="text-left space-y-2 pt-2 border-t border-slate-700/60">
              <label className="block text-2xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-indigo-400" />
                Endereço da API do Servidor:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={this.state.serverUrl}
                  onChange={(e) => this.setState({ serverUrl: e.target.value })}
                  placeholder="http://192.168.0.100:4000/api"
                  className="flex-1 text-xs bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
                <button
                  type="submit"
                  disabled={this.state.isTesting}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>

              {this.state.testResult && (
                <p className="text-2xs text-amber-300 flex items-center gap-1 pt-1">
                  <CheckCircle2 className="w-3 h-3 text-amber-400" />
                  {this.state.testResult}
                </p>
              )}
            </form>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReloadWithCacheBusting}
                className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Recarregar App</span>
              </button>

              <button
                type="button"
                onClick={this.handleClearCache}
                className="py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Limpar Cache</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
