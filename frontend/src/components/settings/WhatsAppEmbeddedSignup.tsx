import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { loadFacebookSdk } from '../../utils/metaSdk';
import {
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Smartphone,
  Cloud,
  Layers,
  PowerOff,
  ShieldCheck,
  Info
} from 'lucide-react';

interface CapturedSessionData {
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
  displayPhoneNumber?: string;
}

interface IntegrationInfo {
  id: string;
  tenantId: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string | null;
  phoneNumber?: string | null;
  displayPhoneNumber?: string | null;
  coexistenceMode: boolean;
  status: 'connected' | 'disconnected' | 'pending' | 'error';
  connectedAt: string;
  updatedAt: string;
}

interface StatusApiResponse {
  success: boolean;
  data: {
    connected: boolean;
    coexistenceActive: boolean;
    integration: IntegrationInfo | null;
    config: {
      appId: string;
      configId: string;
      isConfigured: boolean;
    };
  };
}

export const WhatsAppEmbeddedSignup: React.FC = () => {
  const { showToast } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);
  const [integration, setIntegration] = useState<IntegrationInfo | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [coexistenceActive, setCoexistenceActive] = useState<boolean>(true);
  const [serverConfig, setServerConfig] = useState<{
    appId: string;
    configId: string;
    isConfigured: boolean;
  }>({
    appId: '',
    configId: '',
    isConfigured: false
  });

  const capturedRef = useRef<CapturedSessionData>({});

  // Verifica origens oficiais da Meta/Facebook para postMessage
  const isOfficialMetaOrigin = (origin: string): boolean => {
    try {
      const url = new URL(origin);
      return (
        url.protocol === 'https:' &&
        (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'))
      );
    } catch {
      return false;
    }
  };

  // Carrega status atual da integração e configurações do backend
  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<StatusApiResponse>('/v1/whatsapp-cloud/status');
      if (res && res.data) {
        setIsConnected(Boolean(res.data.connected));
        setCoexistenceActive(Boolean(res.data.coexistenceActive));
        setIntegration(res.data.integration);
        setServerConfig(res.data.config);

        // Se o backend tiver appId configurado, pré-carrega o SDK
        const appIdToUse =
          res.data.config?.appId ||
          (import.meta.env.VITE_META_APP_ID as string) ||
          '';

        if (appIdToUse) {
          loadFacebookSdk(appIdToUse).catch(() => {
            // SDK será tentado novamente no momento do clique se necessário
          });
        }
      }
    } catch (err: any) {
      console.warn('[WhatsAppEmbeddedSignup] Erro ao carregar status:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Listener estrito para window.postMessage de origens oficiais da Meta
    const handlePostMessage = (event: MessageEvent) => {
      if (!isOfficialMetaOrigin(event.origin)) {
        return;
      }

      let messageData = event.data;
      if (typeof messageData === 'string') {
        try {
          messageData = JSON.parse(messageData);
        } catch {
          return;
        }
      }

      if (!messageData || typeof messageData !== 'object') {
        return;
      }

      const eventType = messageData.type || messageData.event;
      if (
        eventType === 'WA_EMBEDDED_SIGNUP' ||
        eventType === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' ||
        eventType === 'FINISH'
      ) {
        const payload = messageData.data || messageData;
        if (payload.waba_id) capturedRef.current.wabaId = String(payload.waba_id);
        if (payload.phone_number_id) capturedRef.current.phoneNumberId = String(payload.phone_number_id);
        if (payload.business_id) capturedRef.current.businessId = String(payload.business_id);
        if (payload.display_phone_number) {
          capturedRef.current.displayPhoneNumber = String(payload.display_phone_number);
        }
      }
    };

    window.addEventListener('message', handlePostMessage);
    return () => {
      window.removeEventListener('message', handlePostMessage);
    };
  }, []);

  // Troca server-to-server do code por access token permanente
  const handleExchangeCode = async (code: string) => {
    try {
      setConnecting(true);
      const payload = {
        code,
        wabaId: capturedRef.current.wabaId,
        phoneNumberId: capturedRef.current.phoneNumberId,
        businessId: capturedRef.current.businessId,
        displayPhoneNumber: capturedRef.current.displayPhoneNumber
      };

      const res = await ApiClient.post<any>('/v1/whatsapp-cloud/exchange-code', payload);
      if (res && res.success) {
        showToast(
          'WhatsApp Business conectado com sucesso em modo de coexistência!',
          'success'
        );
        capturedRef.current = {};
        await fetchStatus();
      } else {
        throw new Error(res.error || 'Falha ao salvar a integração');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao validar autorização com a Meta', 'error');
    } finally {
      setConnecting(false);
    }
  };

  // Inicia o fluxo oficial do Meta Embedded Signup via FB.login com Coexistência
  const handleLaunchEmbeddedSignup = async () => {
    const configId =
      serverConfig.configId ||
      (import.meta.env.VITE_META_WHATSAPP_CONFIG_ID as string) ||
      '';

    const appId =
      serverConfig.appId ||
      (import.meta.env.VITE_META_APP_ID as string) ||
      '';

    if (!configId) {
      showToast(
        'Config ID da Meta não encontrado. Defina META_WHATSAPP_CONFIG_ID nas variáveis de ambiente.',
        'error'
      );
      return;
    }

    try {
      setConnecting(true);
      capturedRef.current = {};

      // Garante carregamento do SDK
      const fb = await loadFacebookSdk(appId);

      if (!fb || typeof fb.login !== 'function') {
        throw new Error('SDK do Facebook não disponível no navegador');
      }

      // Disparo com os parâmetros oficiais de coexistência
      fb.login(
        (response: any) => {
          if (response?.authResponse && response.authResponse.code) {
            const authCode = response.authResponse.code;
            handleExchangeCode(authCode);
          } else {
            setConnecting(false);
            if (response?.status === 'unknown') {
              showToast('Janela de conexão da Meta foi fechada.', 'info');
            }
          }
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: 'whatsapp_business_app_onboarding',
            sessionInfoVersion: '3',
            version: 'v4'
          }
        }
      );
    } catch (err: any) {
      setConnecting(false);
      showToast(err.message || 'Erro ao inicializar fluxo de conexão da Meta', 'error');
    }
  };

  // Desconecta a integração
  const handleDisconnect = async () => {
    if (!window.confirm('Deseja realmente desconectar a integração com a WhatsApp Cloud API?')) {
      return;
    }

    try {
      setDisconnecting(true);
      await ApiClient.post('/v1/whatsapp-cloud/disconnect', {});
      showToast('WhatsApp Cloud API desconectado com sucesso.', 'info');
      await fetchStatus();
    } catch (err: any) {
      showToast(err.message || 'Erro ao desconectar WhatsApp', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-center space-x-3 text-slate-500 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
        <span>Carregando configurações do WhatsApp Cloud...</span>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                WhatsApp Business Cloud API
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Modo de Coexistência
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Conexão oficial via Meta Embedded Signup mantendo o uso simultâneo no app móvel.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchStatus}
          disabled={loading || connecting}
          className="self-start sm:self-auto p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          title="Atualizar status"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Alerta explicativo do Modo de Coexistência */}
      <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100 text-xs text-emerald-900 space-y-2">
        <div className="flex items-center gap-2 font-bold uppercase text-[11px] tracking-wider text-emerald-800">
          <Layers className="w-4 h-4 text-emerald-600" />
          Como funciona a Coexistência no Zemda
        </div>
        <p className="text-emerald-800 leading-relaxed">
          Com a coexistência ativa (<code className="font-mono text-emerald-900 font-bold">featureType: whatsapp_business_app_onboarding</code>),
          o seu número comercial <strong>continua funcionando normalmente no aplicativo móvel WhatsApp Business</strong> no celular da clínica.
          Ao mesmo tempo, o Zemda conecta-se à Cloud API oficial da Meta de forma segura e paralela, sem risco de desativação do app do seu celular.
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] font-medium text-emerald-700">
          <span className="flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" /> App Móvel Mantido
          </span>
          <span className="flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5 text-emerald-600" /> Cloud API Meta Conectada
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Tokens Criptografados (AES-256)
          </span>
        </div>
      </div>

      {/* Card de Status: Conectado */}
      {isConnected && integration ? (
        <div className="p-6 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block">
                  Status: Conectado
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {integration.displayPhoneNumber || integration.phoneNumber || 'Número Conectado'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Coexistência Ativa
              </span>

              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-3.5 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <PowerOff className="w-3.5 h-3.5" />
                {disconnecting ? 'Desconectando...' : 'Desconectar'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 text-xs">
            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-400 font-medium block uppercase tracking-wider">
                WhatsApp Business Account ID (WABA)
              </span>
              <p className="font-mono text-slate-800 font-bold break-all">
                {integration.wabaId}
              </p>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-400 font-medium block uppercase tracking-wider">
                Phone Number ID
              </span>
              <p className="font-mono text-slate-800 font-bold break-all">
                {integration.phoneNumberId}
              </p>
            </div>

            {integration.businessId && (
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                <span className="text-[11px] text-slate-400 font-medium block uppercase tracking-wider">
                  Meta Business ID
                </span>
                <p className="font-mono text-slate-800 font-bold break-all">
                  {integration.businessId}
                </p>
              </div>
            )}

            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-400 font-medium block uppercase tracking-wider">
                Data de Conexão
              </span>
              <p className="text-slate-800 font-semibold">
                {new Date(integration.connectedAt).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Card de Status: Não Conectado */
        <div className="p-6 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="font-bold text-slate-900 text-sm">
                Conectar WhatsApp Business da Clínica
              </h4>
              <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
                Clique no botão abaixo para abrir a janela oficial da Meta e autenticar o seu número corporativo.
                O processo é executado pelo fluxo oficial de <strong>Embedded Signup</strong> com preservação do seu app de celular.
              </p>
            </div>

            <button
              type="button"
              onClick={handleLaunchEmbeddedSignup}
              disabled={connecting}
              className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
            >
              {connecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Conectando com a Meta...
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  Conectar WhatsApp Business
                </>
              )}
            </button>
          </div>

          {/* Avisos de Configuração do Ambiente */}
          {!serverConfig.isConfigured && (
            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block">Variáveis de Ambiente da Meta</span>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  Para ativar a integração em produção no Railway, certifique-se de preencher as variáveis:
                  <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded font-mono font-bold">META_APP_ID</code>,
                  <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded font-mono font-bold">META_APP_SECRET</code> e
                  <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded font-mono font-bold">META_WHATSAPP_CONFIG_ID</code>.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rodapé Informativo */}
      <div className="pt-2 text-xs text-slate-500 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>
          O envio de notificações automatizadas continuará desacoplado até ativação expressa no painel administrativo.
        </span>
      </div>
    </div>
  );
};
