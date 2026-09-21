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
  Info,
  Calendar,
  AlertTriangle
} from 'lucide-react';

interface CapturedSessionData {
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
  displayPhoneNumber?: string;
}

interface IntegrationInfo {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string | null;
  phoneNumber?: string | null;
  displayPhoneNumber?: string | null;
  coexistenceMode: boolean;
  status: 'connected' | 'disconnected' | 'pending' | 'error';
  tokenExpiresAt?: string | null;
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
      apiVersion: string;
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
    apiVersion: string;
    isConfigured: boolean;
  }>({
    appId: '',
    configId: '',
    apiVersion: 'v25.0',
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

  // Carrega status atual da integração central do SaaS
  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<StatusApiResponse>('/v1/admin/whatsapp-cloud/status');
      if (res && res.data) {
        setIsConnected(Boolean(res.data.connected));
        setCoexistenceActive(Boolean(res.data.coexistenceActive));
        setIntegration(res.data.integration);
        setServerConfig(res.data.config);

        const appIdToUse =
          res.data.config?.appId ||
          (import.meta.env.VITE_META_APP_ID as string) ||
          '';

        const apiVersionToUse =
          res.data.config?.apiVersion ||
          (import.meta.env.VITE_META_GRAPH_API_VERSION as string) ||
          'v25.0';

        if (appIdToUse) {
          loadFacebookSdk(appIdToUse, apiVersionToUse).catch(() => {
            // SDK será pré-carregado ou inicializado na ação
          });
        }
      }
    } catch (err: any) {
      console.warn('[WhatsAppEmbeddedSignup] Erro ao carregar status do WhatsApp central:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Listener ESTRITO para window.postMessage de origens oficiais da Meta
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

      // Aceita estritamente mensagens com type 'WA_EMBEDDED_SIGNUP'
      if (messageData.type !== 'WA_EMBEDDED_SIGNUP') {
        return;
      }

      const eventName = messageData.event;
      // Ignora expressamente CANCEL, ERROR e eventos intermediários
      if (
        !eventName ||
        eventName === 'CANCEL' ||
        eventName === 'ERROR' ||
        eventName.includes('CANCEL') ||
        eventName.includes('ERROR')
      ) {
        return;
      }

      // Processa apenas eventos de conclusão válidos, especialmente FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING
      if (
        eventName === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' ||
        eventName === 'FINISH'
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

  // Troca server-to-server do code pelo access token permanente
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

      const res = await ApiClient.post<any>('/v1/admin/whatsapp-cloud/exchange-code', payload);
      if (res && res.success) {
        showToast(
          'WhatsApp Central Oficial Zemda conectado com sucesso em modo de coexistência!',
          'success'
        );
        capturedRef.current = {};
        await fetchStatus();
      } else {
        throw new Error(res.error || 'Falha ao salvar a integração central');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao validar autorização central com a Meta', 'error');
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

    const apiVersion =
      serverConfig.apiVersion ||
      (import.meta.env.VITE_META_GRAPH_API_VERSION as string) ||
      'v25.0';

    if (!configId) {
      showToast(
        'Config ID da Meta não encontrado. Defina META_WHATSAPP_CONFIG_ID no ambiente.',
        'error'
      );
      return;
    }

    try {
      setConnecting(true);
      capturedRef.current = {};

      const fb = await loadFacebookSdk(appId, apiVersion);

      if (!fb || typeof fb.login !== 'function') {
        throw new Error('SDK do Facebook indisponível no navegador.');
      }

      fb.login(
        (response: any) => {
          if (response?.authResponse && response.authResponse.code) {
            const authCode = response.authResponse.code;
            handleExchangeCode(authCode);
          } else {
            setConnecting(false);
            if (response?.status === 'unknown') {
              showToast('Janela de conexão da Meta foi cancelada ou fechada.', 'info');
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

  // Desconecta a integração central e apaga credenciais locais
  const handleDisconnect = async () => {
    if (!window.confirm('Deseja realmente desconectar o número central do Zemda da Cloud API? Os tokens locais serão apagados imediatamente.')) {
      return;
    }

    try {
      setDisconnecting(true);
      await ApiClient.post('/v1/admin/whatsapp-cloud/disconnect', {});
      showToast('WhatsApp Central desconectado e credenciais apagadas.', 'info');
      await fetchStatus();
    } catch (err: any) {
      showToast(err.message || 'Erro ao desconectar WhatsApp central', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  // Determina se o token está próximo do vencimento (menos de 7 dias)
  const isExpiringSoon = (): boolean => {
    if (!integration?.tokenExpiresAt) return false;
    const expires = new Date(integration.tokenExpiresAt).getTime();
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return expires - now < sevenDaysMs;
  };

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-center space-x-3 text-slate-500 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
        <span>Carregando status do WhatsApp Central Zemda...</span>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6">
      {/* Cabeçalho de Governança Global */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                WhatsApp Central Oficial Zemda — Infraestrutura Cloud API
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                  SaaS Global • Meta Graph {serverConfig.apiVersion || 'v25.0'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Número único central do Zemda conectado via Embedded Signup com coexistência no app móvel.
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

      {/* Alerta Arquitetural */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 space-y-2">
        <div className="flex items-center gap-2 font-bold uppercase text-[11px] tracking-wider text-slate-900">
          <Layers className="w-4 h-4 text-indigo-600" />
          Arquitetura Centralizada do Sistema
        </div>
        <p className="text-slate-600 leading-relaxed">
          O Zemda opera com <strong>um único número oficial central</strong> para toda a plataforma. As clínicas não conectam números próprios;
          todas utilizam essa infraestrutura oficial via carteira de créditos e preferências de notificação.
          O aplicativo móvel WhatsApp Business no celular da central Zemda continua funcionando normalmente graças ao <strong>modo de coexistência</strong>.
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] font-medium text-slate-700">
          <span className="flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp Móvel Central Mantido
          </span>
          <span className="flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5 text-indigo-600" /> Meta Cloud API Ativa
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> AES-256-GCM Autenticado
          </span>
        </div>
      </div>

      {/* Alerta de Expiração de Token, se aplicável */}
      {isConnected && integration?.tokenExpiresAt && isExpiringSoon() && (
        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block">Atenção: Renovação de Token Recomendada</span>
            <p className="leading-relaxed">
              O token de acesso da Meta expira em{' '}
              <strong>{new Date(integration.tokenExpiresAt).toLocaleString('pt-BR')}</strong>.
              Reconecte o WhatsApp Business preventivamente antes dessa data para evitar interrupções nos disparos centrais.
            </p>
          </div>
        </div>
      )}

      {/* Card: Central Conectada */}
      {isConnected && integration ? (
        <div className="p-6 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block">
                  Status: Conectado Centralmente
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {integration.displayPhoneNumber || integration.phoneNumber || 'Número Central Oficial'}
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
                {disconnecting ? 'Desconectando...' : 'Desconectar e Limpar'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 text-xs">
            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-400 font-medium block uppercase tracking-wider">
                WABA ID
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

            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-400 font-medium block uppercase tracking-wider">
                Validade do Token
              </span>
              <p className="text-slate-800 font-semibold flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                {integration.tokenExpiresAt
                  ? new Date(integration.tokenExpiresAt).toLocaleString('pt-BR')
                  : 'Longa Duração (Meta)'}
              </p>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-400 font-medium block uppercase tracking-wider">
                Data da Conexão
              </span>
              <p className="text-slate-800 font-semibold">
                {new Date(integration.connectedAt).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Card: Não Conectado */
        <div className="p-6 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="font-bold text-slate-900 text-sm">
                Conectar Número Oficial Central Zemda
              </h4>
              <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
                Abra a autenticação oficial da Meta para vincular o número corporativo da plataforma com <strong>coexistência ativa</strong>.
                O token será validado e criptografado com AES-256-GCM antes de ser ativado.
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
                  Conectar WhatsApp Oficial Central
                </>
              )}
            </button>
          </div>

          {!serverConfig.isConfigured && (
            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block">Configuração Obrigatória no Servidor</span>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  Defina as variáveis no Railway / servidor:
                  <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded font-mono font-bold">META_APP_ID</code>,
                  <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded font-mono font-bold">META_APP_SECRET</code>,
                  <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded font-mono font-bold">META_WHATSAPP_CONFIG_ID</code> e
                  <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded font-mono font-bold">WHATSAPP_TOKEN_ENCRYPTION_KEY</code>.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rodapé */}
      <div className="pt-2 text-xs text-slate-500 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>
          O envio de mensagens pelas clínicas continuará utilizando o simulador desacoplado até ativação expressa no painel do SuperAdmin.
        </span>
      </div>
    </div>
  );
};
