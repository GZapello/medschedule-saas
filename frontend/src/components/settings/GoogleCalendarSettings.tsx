import React, { useEffect, useState, useCallback } from 'react';
import { ApiClient } from '../../api/client';
import { useGoogleCalendarStatus } from '../../hooks/useGoogleCalendarStatus';
import { useToast } from '../../context/ToastContext';
import {
  Calendar,
  CalendarCheck,
  Video,
  RefreshCw,
  ShieldCheck,
  Check,
  AlertTriangle,
  ExternalLink,
  Clock,
  ArrowRightLeft,
  ArrowRight,
  LogOut,
  Sparkles,
  Info,
  CheckCircle2,
  Lock,
  ArrowLeft
} from 'lucide-react';

const endpoint = '/v1/integrations/google-calendar';

interface CalendarItem {
  id: string;
  summary: string;
  primary: boolean;
}

interface PreferencesState {
  calendar_id: string;
  sync_enabled: boolean;
  sync_direction: 'both' | 'zemda_to_google' | 'google_to_zemda';
  block_external_events: boolean;
  create_google_meet: boolean;
  privacy_mode: 'private' | 'show_patient_name';
  sync_interval_option: 'future' | 'next_7_days' | 'next_30_days';
}

interface GoogleCalendarSettingsProps {
  onBack?: () => void;
}

export function GoogleCalendarSettings({ onBack }: GoogleCalendarSettingsProps) {
  const { status, loading, connecting, connectGoogleCalendar, refreshStatus } = useGoogleCalendarStatus();
  const { showToast } = useToast();

  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [preferences, setPreferences] = useState<PreferencesState>({
    calendar_id: 'primary',
    sync_enabled: true,
    sync_direction: 'both',
    block_external_events: true,
    create_google_meet: true,
    privacy_mode: 'private',
    sync_interval_option: 'future',
  });

  // Atualiza preferências locais com base no status retornado pelo backend
  useEffect(() => {
    if (!status?.connected) {
      setCalendars([]);
      return;
    }

    setPreferences({
      calendar_id: status.calendarId || 'primary',
      sync_enabled: status.syncEnabled !== undefined ? Boolean(status.syncEnabled) : true,
      sync_direction: (status.syncDirection as any) || 'both',
      block_external_events: status.blockExternalEvents !== undefined ? Boolean(status.blockExternalEvents) : true,
      create_google_meet: status.createGoogleMeet !== undefined ? Boolean(status.createGoogleMeet) : true,
      privacy_mode: (status.privacyMode as any) || 'private',
      sync_interval_option: (status.syncIntervalOption as any) || 'future',
    });

    let active = true;
    setLoadingCalendars(true);

    ApiClient.get<{ calendars: CalendarItem[] }>(`${endpoint}/calendars`)
      .then((result) => {
        if (!active) return;
        const list = result.calendars || [];
        setCalendars(list);

        // Seleção automática caso ainda não haja calendar_id definido
        if (!status.calendarId || status.calendarId === 'primary') {
          const primaryCal = list.find((c) => c.primary) || list[0];
          if (primaryCal && primaryCal.id !== status.calendarId) {
            setPreferences((prev) => ({ ...prev, calendar_id: primaryCal.id }));
          }
        }
      })
      .catch((err) => {
        if (!active) return;
        console.warn('[GoogleCalendarSettings] Erro ao carregar agendas:', err);
      })
      .finally(() => {
        if (active) setLoadingCalendars(false);
      });

    return () => {
      active = false;
    };
  }, [status]);

  // Formata data e hora da última sincronização no fuso de São Paulo
  const formatLastSync = (isoString?: string) => {
    if (!isoString) return 'Ainda não sincronizado';
    try {
      const clean = isoString.includes('T') ? isoString : isoString.replace(' ', 'T') + 'Z';
      const date = new Date(clean);
      if (isNaN(date.getTime())) return isoString;

      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  // Salvar preferências
  const handleSavePreferences = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingPreferences(true);
    setSaveSuccess(false);

    try {
      await ApiClient.put(`${endpoint}/settings`, preferences);
      setSaveSuccess(true);
      showToast('Preferências de sincronização salvas com sucesso!', 'success');
      await refreshStatus();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível salvar as preferências.', 'error');
    } finally {
      setSavingPreferences(false);
    }
  };

  // Sincronizar agora manualmente
  const handleSyncNow = async () => {
    setSyncingNow(true);
    try {
      const res = await ApiClient.post<{ message: string; syncedCount?: number; pendingCount?: number }>(
        `${endpoint}/sync`
      );
      showToast(res.message || 'Sincronização com o Google Calendar concluída!', 'success');
      await refreshStatus();
    } catch (err: any) {
      showToast(err?.message || 'Falha ao sincronizar com Google Agenda.', 'error');
    } finally {
      setSyncingNow(false);
    }
  };

  // Confirmar desconexão
  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await ApiClient.delete<{ message: string }>(`${endpoint}/disconnect`);
      showToast(res.message || 'Conta Google desconectada com sucesso.', 'success');
      setConfirmDisconnect(false);
      await refreshStatus();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao desconectar conta Google.', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  // Ícone oficial SVG do Google
  const GoogleGIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-slate-800 pb-12" aria-label="Integração Google Agenda e Meet">
      {/* CABEÇALHO DA PÁGINA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer shrink-0 mt-0.5"
              title="Voltar ao menu de configurações"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 shadow-2xs">
            <GoogleGIcon className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Google Agenda e Meet
              </h1>
              {status?.connected ? (
                status.syncStatus === 'reconnection_required' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Reconexão necessária
                  </span>
                ) : preferences.sync_enabled ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Sincronização ativa
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Sincronização pausada
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                  Não conectado
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
              Sincronize seus atendimentos do Zemda em tempo real, bloqueie horários ocupados e gere salas do Google Meet para teleconsultas.
            </p>
          </div>
        </div>

        {status?.connected && (
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              disabled={syncingNow || busy || !status.syncEnabled}
              onClick={handleSyncNow}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingNow ? 'animate-spin' : ''}`} />
              <span>{syncingNow ? 'Sincronizando…' : 'Sincronizar agora'}</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDisconnect(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
              title="Desconectar conta Google"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Desconectar</span>
            </button>
          </div>
        )}
      </div>

      {/* ESTADO: CARREGANDO INICIAL */}
      {loading && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3 shadow-2xs">
          <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">Verificando status da integração Google Agenda…</p>
        </div>
      )}

      {/* ESTADO: NÃO CONFIGURADO NO SERVIDOR PELO ADMINISTRADOR */}
      {!loading && !status?.configured && !status?.connected && (
        <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-6 text-amber-900 space-y-2 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span>Configuração do Google Cloud pendente</span>
          </div>
          <p className="text-sm text-amber-800 leading-relaxed">
            As credenciais OAuth do Google Calendar ainda não foram configuradas no servidor pelo administrador do sistema.
            Confira as variáveis <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">GOOGLE_CALENDAR_CLIENT_ID</code> e <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">GOOGLE_CALENDAR_CLIENT_SECRET</code> no painel de implantação.
          </p>
        </div>
      )}

      {/* ESTADO: DESCONECTADO (HERO CARD DE CONEXÃO SAAS) */}
      {!loading && !status?.connected && (status?.configured ?? true) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-6 sm:p-8 space-y-6">
            <div className="max-w-2xl space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                <Sparkles className="w-3.5 h-3.5" />
                Conecte em 1 clique
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Vincule sua Google Agenda ao Zemda
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Ao conectar sua conta, os agendamentos realizados no Zemda são sincronizados automaticamente com o Google Calendar. Seus horários ocupados no Google são respeitados e links do Google Meet são gerados sem passos extras.
              </p>
            </div>

            {/* BENEFÍCIOS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-sm text-slate-900">Sincronização Automática</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Criação, remarcação e cancelamento refletem instantaneamente no Google Agenda.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Video className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-sm text-slate-900">Google Meet em Teleconsultas</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Geração automática de salas Meet seguras anexadas diretamente ao prontuário e à agenda.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <CalendarCheck className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-sm text-slate-900">Bloqueio de Conflitos</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Compromissos externos no Google bloqueiam a grade de horários da clínica sem expor detalhes.
                </p>
              </div>
            </div>

            {/* AÇÃO PRINCIPAL DE CONEXÃO */}
            <div className="pt-3 flex flex-col sm:flex-row items-center gap-4">
              <button
                type="button"
                disabled={connecting || busy}
                onClick={connectGoogleCalendar}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-xs hover:shadow-sm transition-all cursor-pointer disabled:opacity-60"
              >
                {connecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Redirecionando para o Google…</span>
                  </>
                ) : (
                  <>
                    <div className="w-5 h-5 rounded-md bg-white p-0.5 flex items-center justify-center">
                      <GoogleGIcon className="w-4 h-4" />
                    </div>
                    <span>Conectar com Google Agenda</span>
                  </>
                )}
              </button>
              <span className="text-xs text-slate-500">
                A sincronização é ativada automaticamente assim que autorizada.
              </span>
            </div>
          </div>

          {/* CARD DE SEGURANÇA E PRIVACIDADE NO ESTADO DESCONECTADO */}
          <div className="bg-slate-50/80 border-t border-slate-100 p-5 sm:p-6 text-xs text-slate-500 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-700">Privacidade Médica Rigorosa</p>
              <p className="leading-relaxed">
                A conexão é isolada e restrita a você nesta clínica. Prontuários médicos, anamneses e diagnósticos
                <strong> nunca são enviados</strong> aos eventos do Google. Não solicitamos permissão para ler seus e-mails do Gmail nem arquivos do Google Drive.{' '}
                <a
                  href="/privacidade"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 font-semibold hover:underline inline-flex items-center gap-0.5"
                >
                  Como usamos seus dados <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ESTADO: CONECTADO */}
      {!loading && status?.connected && (
        <div className="space-y-6">
          {/* BANNER SE HOUVER NECESSIDADE DE RECONEXÃO OU ERRO */}
          {status.lastSyncError && (
            <div className="bg-rose-50/90 border border-rose-200/90 rounded-2xl p-4 sm:p-5 text-rose-900 flex items-start gap-3.5 shadow-2xs">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs sm:text-sm flex-1">
                <p className="font-bold text-rose-950">Atenção na sincronização</p>
                <p className="text-rose-800 leading-relaxed">{status.lastSyncError}</p>
                {status.syncStatus === 'reconnection_required' && (
                  <button
                    type="button"
                    onClick={connectGoogleCalendar}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700 transition-colors cursor-pointer"
                  >
                    Reconectar conta Google agora
                  </button>
                )}
              </div>
            </div>
          )}

          {/* CARD 1: DETALHES DA CONEXÃO & MÉTRICAS OPERACIONAIS */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-indigo-700 text-sm">
                  {status.accountEmail ? status.accountEmail.charAt(0).toUpperCase() : 'G'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Conta Google Conectada</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  </div>
                  <p className="text-base font-bold text-slate-900 break-all">{status.accountEmail}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Última sincronização: <strong>{formatLastSync(status.lastSyncAt)}</strong></span>
              </div>
            </div>

            {/* STATUS CARDS RESUMO */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">Sincronização</span>
                <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  {preferences.sync_enabled ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Ativa e automática</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-amber-700">Pausada</span>
                    </>
                  )}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">Agenda Selecionada</span>
                <p className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="truncate">{status.calendarName || 'Agenda principal'}</span>
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">Notificações em Tempo Real</span>
                <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${status.notificationsActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span>{status.notificationsActive ? 'Webhooks ativos' : 'Monitoramento periódico'}</span>
                </p>
              </div>
            </div>
          </div>

          {/* FORMULÁRIO DE CONFIGURAÇÃO E PREFERÊNCIAS */}
          <form onSubmit={handleSavePreferences} className="space-y-6">
            {/* CARD 2: ESCOLHA DA AGENDA GOOGLE */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Agenda de Destino</h3>
                  <p className="text-xs text-slate-500">Selecione onde os atendimentos do Zemda serão gravados.</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Agenda da conta Google
                </label>
                <div className="relative">
                  <select
                    disabled={busy || loadingCalendars}
                    value={preferences.calendar_id}
                    onChange={(e) => setPreferences({ ...preferences, calendar_id: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all outline-hidden cursor-pointer disabled:bg-slate-50 disabled:opacity-60"
                  >
                    <option value={status.calendarId || 'primary'}>
                      {status.calendarName ? `${status.calendarName} (Principal / Atual)` : 'Agenda principal da conta'}
                    </option>
                    {calendars
                      .filter((c) => c.id !== status.calendarId && !(status.calendarId === 'primary' && c.primary))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.summary} {c.primary ? '(Principal)' : ''}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium text-[11px]">
                    <Check className="w-3 h-3" /> Agenda principal vinculada automaticamente
                  </span>
                  {calendars.length > 1 && (
                    <span className="text-[11px] text-slate-400">
                      ({calendars.length} agendas disponíveis nesta conta)
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                  Para alterar uma agenda que já possui atendimentos sincronizados, desconecte e reconecte na agenda desejada. Seus eventos já criados permanecem salvos no Google.
                </p>
              </div>
            </div>

            {/* CARD 3: REGRAS E PREFERÊNCIAS DE SINCRONIZAÇÃO */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 sm:p-6 space-y-6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Regras de Sincronização</h3>
                  <p className="text-xs text-slate-500">Defina o comportamento e o fluxo de dados entre os calendários.</p>
                </div>
              </div>

              {/* TOGGLE: SINCRONIZAÇÃO ATIVA */}
              <div className={`p-4 rounded-xl border transition-all ${preferences.sync_enabled ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50/60 border-slate-200'}`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.sync_enabled}
                    onChange={(e) => setPreferences({ ...preferences, sync_enabled: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="text-sm font-bold text-slate-900">
                      Sincronização ativa de agendamentos
                    </span>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Ao criar, remarcar ou cancelar consultas no Zemda, os eventos correspondentes na Google Agenda são atualizados automaticamente.
                    </p>
                  </div>
                </label>
              </div>

              {/* DIREÇÃO DA SINCRONIZAÇÃO */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700">
                  Direção da integração
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setPreferences({ ...preferences, sync_direction: 'both' })}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                      preferences.sync_direction === 'both'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Zemda ↔ Google</span>
                      {preferences.sync_direction === 'both' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <span className="inline-block text-[10px] font-semibold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.2 rounded">
                      Recomendado
                    </span>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      Envia atendimentos e bloqueia horários externos ocupados.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreferences({ ...preferences, sync_direction: 'zemda_to_google' })}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                      preferences.sync_direction === 'zemda_to_google'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Zemda → Google</span>
                      {preferences.sync_direction === 'zemda_to_google' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight pt-1">
                      Apenas envia os agendamentos do Zemda para a Google Agenda.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreferences({ ...preferences, sync_direction: 'google_to_zemda' })}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                      preferences.sync_direction === 'google_to_zemda'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Google → Zemda</span>
                      {preferences.sync_direction === 'google_to_zemda' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight pt-1">
                      Apenas importa bloqueios da Google Agenda na grade do Zemda.
                    </p>
                  </button>
                </div>
              </div>

              {/* OPÇÕES ADICIONAIS: GOOGLE MEET & BLOQUEIO EXTERNO */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                {/* TOGGLE GOOGLE MEET */}
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={preferences.create_google_meet}
                    onChange={(e) => setPreferences({ ...preferences, create_google_meet: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <Video className="w-4 h-4 text-indigo-600" />
                      Gerar Google Meet automaticamente em teleconsultas
                    </span>
                    <p className="text-xs text-slate-500">
                      Cria uma sala oficial do Meet para atendimentos online e anexa o link diretamente na ficha do paciente.
                    </p>
                  </div>
                </label>

                {/* TOGGLE BLOQUEIO EXTERNO */}
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={preferences.block_external_events}
                    onChange={(e) => setPreferences({ ...preferences, block_external_events: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <CalendarCheck className="w-4 h-4 text-indigo-600" />
                      Bloquear horários ocupados no Google Agenda
                    </span>
                    <p className="text-xs text-slate-500">
                      Compromissos pessoais ou externos impedem novos agendamentos no Zemda no mesmo horário, evitando conflitos.
                    </p>
                  </div>
                </label>
              </div>

              {/* PRIVACIDADE E PERÍODO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Título dos eventos no Google
                  </label>
                  <select
                    value={preferences.privacy_mode}
                    onChange={(e) => setPreferences({ ...preferences, privacy_mode: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-hidden cursor-pointer"
                  >
                    <option value="private">Atendimento Zemda (Privado — Sem nome do paciente)</option>
                    <option value="show_patient_name">Atendimento Zemda: Nome do Paciente</option>
                  </select>
                  {preferences.privacy_mode === 'show_patient_name' && (
                    <p className="text-[11px] text-amber-700 font-medium pt-1">
                      Atenção: O nome do paciente ficará visível para quem tiver acesso à sua agenda do Google.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Janela de sincronização
                  </label>
                  <select
                    value={preferences.sync_interval_option}
                    onChange={(e) => setPreferences({ ...preferences, sync_interval_option: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-hidden cursor-pointer"
                  >
                    <option value="future">Todos os atendimentos futuros (Recomendado)</option>
                    <option value="next_7_days">Apenas próximos 7 dias</option>
                    <option value="next_30_days">Apenas próximos 30 dias</option>
                  </select>
                </div>
              </div>
            </div>

            {/* BOTÃO SALVAR PREFERÊNCIAS */}
            <div className="flex items-center justify-between gap-4 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingPreferences || busy}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-xs hover:shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingPreferences ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Salvando preferências…</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Salvar preferências</span>
                    </>
                  )}
                </button>

                {saveSuccess && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Preferências atualizadas!
                  </span>
                )}
              </div>

              <span className="text-xs text-slate-400 hidden sm:inline">
                A sincronização padrão já opera de forma contínua.
              </span>
            </div>
          </form>

          {/* CARD DE SEGURANÇA E TRANSPARÊNCIA */}
          <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-5 text-xs text-slate-500 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-700">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Garantia de Isolamento e Segurança Médica</span>
            </div>
            <p className="leading-relaxed">
              Tokens de acesso são armazenados com criptografia dedicada AES-256-GCM. A integração é restrita exclusivamente à sua conta profissional nesta clínica. Nenhum diagnóstico, prontuário clínico ou informação confidencial do paciente é transferido ao Google Calendar.{' '}
              <a
                href="/privacidade"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 font-semibold hover:underline inline-flex items-center gap-0.5"
              >
                Política de Privacidade do Zemda <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE DESCONEXÃO */}
      {confirmDisconnect && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-bold text-slate-900">Desconectar Google Agenda?</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                A sincronização será interrompida e os tokens salvos serão excluídos. Seus atendimentos no Zemda e os eventos já existentes no Google Calendar serão <strong>preservados intactos</strong>.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={disconnecting}
                onClick={handleDisconnect}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {disconnecting ? 'Desconectando…' : 'Sim, desconectar'}
              </button>

              <button
                type="button"
                disabled={disconnecting}
                onClick={() => setConfirmDisconnect(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
