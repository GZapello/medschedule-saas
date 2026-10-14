import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Server,
  KeyRound,
  PhoneCall,
  Clock,
  Sparkles,
  Info
} from 'lucide-react';

interface InfobipStatusResponse {
  success: boolean;
  data: {
    provider: 'infobip';
    hasApiKey: boolean;
    hasBaseUrl: boolean;
    baseUrlHost: string | null;
    hasSender: boolean;
    sender: string | null;
    isConfigured: boolean;
  };
}

interface TestSendResponse {
  success: boolean;
  provider: 'infobip';
  message: string;
  messageId?: string;
  status?: {
    groupId?: number;
    groupName?: string;
    id?: number;
    name?: string;
    description?: string;
  };
  recipient?: string;
  recipientFormatted?: string;
  timestamp?: string;
  error?: string;
}

export const InfobipWhatsAppAdmin: React.FC = () => {
  const { showToast } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [statusData, setStatusData] = useState<InfobipStatusResponse['data'] | null>(null);

  // Form de teste
  const [recipient, setRecipient] = useState<string>('');
  const [message, setMessage] = useState<string>('Olá! Esta é uma mensagem de teste do Zemda — Saúde & Gestão. 💚');
  const [sending, setSending] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestSendResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await ApiClient.get<InfobipStatusResponse>('/v1/admin/integrations/infobip/status');
      if (res && res.data) {
        setStatusData(res.data);
      }
    } catch (err: any) {
      console.error('[InfobipWhatsAppAdmin] Erro ao carregar status:', err.message || err);
      showToast('Falha ao verificar status da integração Infobip.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim()) {
      showToast('Informe o número de telefone com DDD para o teste.', 'error');
      return;
    }

    setSending(true);
    setTestResult(null);
    setTestError(null);

    try {
      const res = await ApiClient.post<TestSendResponse>('/v1/admin/integrations/infobip/test', {
        to: recipient.trim(),
        message: message.trim()
      });

      if (res && res.success) {
        setTestResult(res);
        showToast('Mensagem de teste enviada com sucesso!', 'success');
      } else {
        const errorMsg = res?.error || 'Erro desconhecido ao enviar mensagem pela Infobip.';
        setTestError(errorMsg);
        showToast(errorMsg, 'error');
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Falha na comunicação ao tentar enviar mensagem de teste.';
      setTestError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com Banner do Provedor Oficial */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-emerald-50 to-teal-50/20 rounded-full blur-3xl -z-10" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200/70 rounded-full text-xs font-bold text-emerald-800">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              WhatsApp Oficial do SaaS
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Infraestrutura Central Infobip WhatsApp
            </h2>
            <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
              O Zemda utiliza a <strong>Infobip</strong> como provider oficial e exclusivo de WhatsApp Enterprise.
              As credenciais são gerenciadas com segurança estrita via variáveis de ambiente no Railway.
            </p>
          </div>

          <button
            onClick={fetchStatus}
            disabled={loading}
            className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar Diagnóstico
          </button>
        </div>

        {/* Diagnóstico de Variáveis de Ambiente */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card Provider */}
          <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Provider</div>
              <div className="text-sm font-black text-slate-900 truncate">Infobip Enterprise</div>
              <div className="text-[11px] text-emerald-700 font-semibold">Exclusivo Zemda</div>
            </div>
          </div>

          {/* Card API Key */}
          <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 flex items-center gap-3.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                statusData?.hasApiKey ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">INFOBIP_API_KEY</div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {statusData?.hasApiKey ? 'Configurada' : 'Não configurada'}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {statusData?.hasApiKey ? 'Railway Environment' : 'Definir no Railway'}
              </div>
            </div>
          </div>

          {/* Card Base URL */}
          <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 flex items-center gap-3.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                statusData?.hasBaseUrl ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">INFOBIP_BASE_URL</div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {statusData?.baseUrlHost || (statusData?.hasBaseUrl ? 'Configurada' : 'Não configurada')}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {statusData?.hasBaseUrl ? 'API Endpoint Ativo' : 'Definir no Railway'}
              </div>
            </div>
          </div>

          {/* Card Sender */}
          <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 flex items-center gap-3.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                statusData?.hasSender ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              <PhoneCall className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">WHATSAPP_SENDER</div>
              <div className="text-sm font-bold text-slate-900 truncate">
                {statusData?.sender || (statusData?.hasSender ? 'Configurado' : 'Pendente')}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {statusData?.hasSender ? 'Número de Envio' : 'Opcional / Railway'}
              </div>
            </div>
          </div>
        </div>

        {/* Status Geral de Prontidão */}
        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            {statusData?.isConfigured ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-emerald-900">
                  Integração Pronta: o backend está habilitado para envio de WhatsApp via Infobip.
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span className="font-bold text-amber-900">
                  Configuração pendente: certifique-se de que INFOBIP_API_KEY, INFOBIP_BASE_URL e INFOBIP_WHATSAPP_SENDER estão no Railway.
                </span>
              </>
            )}
          </div>
          <div className="text-slate-500 font-medium flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Autenticação segura via App Token
          </div>
        </div>
      </div>

      {/* Seção de Disparo de Teste */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Disparo de Teste em Tempo Real</h3>
              <p className="text-xs text-slate-500 font-medium">
                Envie uma mensagem de teste oficial para validar o canal e a resposta da Infobip.
              </p>
            </div>
          </div>

          <form onSubmit={handleSendTest} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Número do Destinatário (com DDD)
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Ex: (11) 98765-4321 ou 5511987654321"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                disabled={sending}
                required
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                O número será automaticamente normalizado para o padrão internacional (E.164 com DDI 55).
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Mensagem de Teste
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                disabled={sending}
                required
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Disparando Mensagem via Infobip...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar Mensagem de Teste
                </>
              )}
            </button>
          </form>

          {/* Feedback de Sucesso */}
          {testResult && (
            <div className="mt-6 p-4 bg-emerald-50/80 border border-emerald-200/90 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                Mensagem aceita com sucesso pela Infobip!
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-emerald-950 font-medium">
                <div>
                  <span className="text-emerald-700 block font-bold">Message ID:</span>
                  <code className="bg-emerald-100/70 px-1.5 py-0.5 rounded font-mono text-[10px] break-all">
                    {testResult.messageId}
                  </code>
                </div>
                <div>
                  <span className="text-emerald-700 block font-bold">Status Infobip:</span>
                  <span className="px-1.5 py-0.5 bg-emerald-200/60 rounded font-semibold text-[10px]">
                    {testResult.status?.name || testResult.status?.groupName || 'PENDING'}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-700 block font-bold">Destinatário:</span>
                  <span>{testResult.recipientFormatted || testResult.recipient}</span>
                </div>
                <div>
                  <span className="text-emerald-700 block font-bold">Data / Hora:</span>
                  <span>{testResult.timestamp ? new Date(testResult.timestamp).toLocaleString('pt-BR') : '-'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Feedback de Erro */}
          {testError && (
            <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-900">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Falha no disparo de teste:</span>
                <span className="font-medium text-rose-800 break-words">{testError}</span>
              </div>
            </div>
          )}
        </div>

        {/* Guia e Boas Práticas */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 md:p-8 text-white space-y-5 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h4 className="font-black text-sm tracking-wide">Arquitetura Unificada</h4>
          </div>

          <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed">
            <p>
              A integração direta com a Meta WhatsApp Cloud API foi completamente substituída pelo provedor Infobip,
              garantindo maior estabilidade e atendimento empresarial.
            </p>
            <div className="p-3 bg-white/5 border border-white/10 rounded-2xl space-y-1.5 text-[11px]">
              <span className="font-bold text-white block">Variáveis no Railway:</span>
              <ul className="list-disc pl-4 space-y-1 text-slate-300">
                <li><code className="text-emerald-400 font-mono">INFOBIP_API_KEY</code> — Token da conta</li>
                <li><code className="text-emerald-400 font-mono">INFOBIP_BASE_URL</code> — Domínio exclusivo da API</li>
                <li><code className="text-emerald-400 font-mono">INFOBIP_WHATSAPP_SENDER</code> — Número remetente</li>
              </ul>
            </div>
            <p className="text-[11px] text-slate-400">
              Nenhum token ou segredo fica salvo no banco SQLite. Tudo é consultado em tempo de execução via variáveis de ambiente seguras.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
