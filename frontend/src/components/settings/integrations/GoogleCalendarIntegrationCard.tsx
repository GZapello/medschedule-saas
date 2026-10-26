import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, AlertCircle, RefreshCw, Settings, Unlink, ExternalLink, Loader2, Sparkles, Video, ShieldCheck } from 'lucide-react';
import { ApiClient } from '../../../api/client';
import { useToast } from '../../../context/ToastContext';
import { GoogleCalendarSettingsModal } from './GoogleCalendarSettingsModal';

interface GoogleCalendarStatus {
  configured: boolean;
  connected: boolean;
  message?: string;
  accountEmail?: string;
  calendarId?: string;
  calendarName?: string;
  syncEnabled?: boolean;
  syncDirection?: string;
  blockExternalEvents?: boolean;
  createGoogleMeet?: boolean;
  privacyMode?: 'private' | 'show_patient_name';
  syncIntervalOption?: 'future' | 'next_7_days' | 'next_30_days';
  lastSyncAt?: string | null;
}

export const GoogleCalendarIntegrationCard: React.FC = () => {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  useEffect(() => {
    loadStatus();
    checkUrlQueryParams();
  }, []);

  const checkUrlQueryParams = () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const googleCal = urlParams.get('google_calendar');
      const googleCalError = urlParams.get('google_calendar_error');

      if (googleCal === 'connected') {
        showToast('Google Agenda conectada com sucesso!', 'success');
        cleanUrlParams(['google_calendar']);
      } else if (googleCalError) {
        showToast(`Erro na integração com Google Agenda: ${decodeURIComponent(googleCalError)}`, 'error');
        cleanUrlParams(['google_calendar_error']);
      }
    } catch (_) {}
  };

  const cleanUrlParams = (keys: string[]) => {
    try {
      const url = new URL(window.location.href);
      for (const k of keys) {
        url.searchParams.delete(k);
      }
      window.history.replaceState({}, document.title, url.pathname + url.search);
    } catch (_) {}
  };

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<GoogleCalendarStatus>('/v1/integrations/google-calendar/status');
      setStatus(res);
    } catch (err: any) {
      console.warn('Erro ao consultar status Google Calendar:', err);
      setStatus({ configured: false, connected: false });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const returnUrl = window.location.href;
      const res = await ApiClient.get<{ url: string }>(`/v1/integrations/google-calendar/connect?return_url=${encodeURIComponent(returnUrl)}`);

      if (res && res.url) {
        window.location.href = res.url;
      } else {
        showToast('Não foi possível obter a URL de autorização da Google.', 'error');
      }
    } catch (err: any) {
      console.error('Erro ao conectar Google Agenda:', err);
      showToast(err?.message || 'Erro ao iniciar conexão com Google Agenda', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setSyncing(true);
      const res = await ApiClient.post<{ success: boolean; syncedCount: number; message: string }>('/v1/integrations/google-calendar/sync', {});
      showToast(res.message || 'Sincronização concluída com sucesso!', 'success');
      loadStatus();
    } catch (err: any) {
      console.error('Erro ao sincronizar agora:', err);
      showToast(err?.message || 'Erro ao sincronizar com Google Agenda', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      await ApiClient.delete('/v1/integrations/google-calendar/disconnect');
      showToast('Google Agenda desconectada com sucesso.', 'success');
      setShowDisconnectModal(false);
      loadStatus();
    } catch (err: any) {
      console.error('Erro ao desconectar Google Agenda:', err);
      showToast(err?.message || 'Erro ao desconectar Google Agenda', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const formatLastSync = (dateStr?: string | null) => {
    if (!dateStr) return 'Pendente';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-center gap-3 text-xs text-slate-500 min-h-[140px]">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        <span>Carregando status da Google Agenda...</span>
      </div>
    );
  }

  const isConfigured = status?.configured ?? false;
  const isConnected = status?.connected ?? false;

  return (
    <>
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-5 text-xs">
        {/* Header do Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold shadow-2xs">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm">Google Agenda</h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Individual por Profissional
                </span>
              </div>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Sincronize seus atendimentos do Zemda com sua agenda Google e evite conflitos com compromissos externos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isConnected ? (
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] flex items-center gap-1.5 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                ✓ Conectado
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                Não conectado
              </span>
            )}
          </div>
        </div>

        {/* Cenário 1: Administrador ainda não configurou as credenciais no servidor */}
        {!isConfigured && (
          <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/60 text-amber-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Google Agenda ainda não configurado pelo administrador</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Para habilitar esta integração, cadastre as credenciais OAuth 2.0 no painel do servidor (Railway):
              <code className="mx-1 px-1.5 py-0.5 rounded bg-amber-100/80 font-mono text-[10px]">GOOGLE_CALENDAR_CLIENT_ID</code>
              e
              <code className="mx-1 px-1.5 py-0.5 rounded bg-amber-100/80 font-mono text-[10px]">GOOGLE_CALENDAR_CLIENT_SECRET</code>.
            </p>
          </div>
        )}

        {/* Cenário 2: Configurado mas NÃO CONECTADO */}
        {isConfigured && !isConnected && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1">
                <div className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Sincronização Automática
                </div>
                <p className="text-slate-500 text-[10px] leading-relaxed">
                  Novos atendimentos e reagendamentos são enviados à sua Google Agenda em tempo real.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1">
                <div className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Bloqueio de Conflitos
                </div>
                <p className="text-slate-500 text-[10px] leading-relaxed">
                  Compromissos externos na Google Agenda bloqueiam automaticamente seus horários disponíveis no Zemda.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1">
                <div className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-blue-600" />
                  Google Meet Único
                </div>
                <p className="text-slate-500 text-[10px] leading-relaxed">
                  Links exclusivos de Google Meet para teleconsultas online sem reaproveitamento entre pacientes.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
              <p className="text-[11px] text-slate-500">
                Sua conta Google é conectada individualmente e suas credenciais são protegidas por criptografia militar AES-256-GCM.
              </p>

              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="px-5 py-2.5 rounded-2xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
              >
                {connecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4" />
                    <span>Conectar Google Agenda</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Cenário 3: CONECTADO */}
        {isConfigured && isConnected && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Conta Google</span>
                <span className="font-bold text-slate-900 block truncate text-xs" title={status?.accountEmail}>
                  {status?.accountEmail || 'Conectada'}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Agenda Selecionada</span>
                <span className="font-bold text-slate-900 block truncate text-xs">
                  {status?.calendarName || 'Agenda principal'}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Última Sincronização</span>
                <span className="font-bold text-slate-900 block text-xs">
                  {formatLastSync(status?.lastSyncAt)}
                </span>
              </div>
            </div>

            {/* Badges de recursos ativos */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px]">
              {status?.syncEnabled && (
                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                  Sincronização Zemda → Google Ativa
                </span>
              )}

              {status?.blockExternalEvents && (
                <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 font-semibold border border-teal-100 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-teal-600" />
                  Bloqueio por FreeBusy Ativo
                </span>
              )}

              {status?.createGoogleMeet && (
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold border border-blue-100 flex items-center gap-1">
                  <Video className="w-3 h-3 text-blue-600" />
                  Google Meet Automático
                </span>
              )}

              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                {status?.privacyMode === 'show_patient_name' ? 'Nome do Paciente Visível' : 'Privacidade Máxima (Somente Atendimento Zemda)'}
              </span>
            </div>

            {/* Ações: Configurar, Sincronizar agora, Desconectar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 font-bold text-slate-700 text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  <span>Configurar</span>
                </button>

                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={syncing}
                  className="px-4 py-2 rounded-xl border border-indigo-200 hover:border-indigo-300 bg-indigo-50/70 hover:bg-indigo-50 font-bold text-indigo-700 text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{syncing ? 'Sincronizando...' : 'Sincronizar agora'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowDisconnectModal(true)}
                className="px-3.5 py-2 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Desconectar</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Configurações */}
      {status && (
        <GoogleCalendarSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          currentSettings={status}
          onSaveSuccess={loadStatus}
        />
      )}

      {/* Modal de Confirmação de Desconexão */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                <Unlink className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Desconectar Google Agenda?</h3>
                <p className="text-slate-500 text-xs">A sincronização automática será interrompida</p>
              </div>
            </div>

            <p className="text-slate-600 text-xs leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              Seus atendimentos no Zemda <strong>não serão removidos</strong>. Apenas a comunicação bidirecional com a sua conta Google será finalizada.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                disabled={disconnecting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {disconnecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Desconectando...</span>
                  </>
                ) : (
                  <span>Confirmar Desconexão</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
