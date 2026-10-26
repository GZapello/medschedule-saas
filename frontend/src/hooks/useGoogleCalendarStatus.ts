import { useState, useEffect, useCallback } from 'react';
import { ApiClient } from '../api/client';
import { useToast } from '../context/ToastContext';

export interface GoogleCalendarStatusData {
  configured: boolean;
  connected: boolean;
  message?: string;
  accountEmail?: string;
  calendarId?: string;
  calendarName?: string;
}

export function useGoogleCalendarStatus() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<GoogleCalendarStatusData | null>(null);
  const { showToast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await ApiClient.get<GoogleCalendarStatusData>('/v1/integrations/google-calendar/status');
      setStatus(res);
      return res;
    } catch {
      setStatus({ configured: false, connected: false });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const checkUrlParams = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      const urlParams = new URLSearchParams(window.location.search);
      const googleCal = urlParams.get('google_calendar');
      const googleCalError = urlParams.get('google_calendar_error');

      if (googleCal === 'connected') {
        showToast('Google Agenda conectada com sucesso!', 'success');
        const url = new URL(window.location.href);
        url.searchParams.delete('google_calendar');
        window.history.replaceState({}, document.title, url.pathname + (url.search || ''));
        fetchStatus();
      } else if (googleCalError) {
        showToast(`Erro ao conectar Google Agenda: ${decodeURIComponent(googleCalError)}`, 'error');
        const url = new URL(window.location.href);
        url.searchParams.delete('google_calendar_error');
        window.history.replaceState({}, document.title, url.pathname + (url.search || ''));
        fetchStatus();
      }
    } catch (_) {}
  }, [showToast, fetchStatus]);

  useEffect(() => {
    fetchStatus();
    checkUrlParams();

    const handleFocus = () => {
      fetchStatus();
    };
    window.addEventListener('focus', handleFocus);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchStatus, checkUrlParams]);

  const connectGoogleCalendar = useCallback(async (onNavigateFallback?: (view: string, subId?: string | null) => void) => {
    try {
      setConnecting(true);
      const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://zemda.com.br';
      const res = await ApiClient.get<{ url: string }>(`/v1/integrations/google-calendar/connect?return_url=${encodeURIComponent(currentUrl)}`);
      if (res && res.url) {
        window.location.href = res.url;
        return;
      }
    } catch (err: any) {
      console.warn('[useGoogleCalendarStatus] Fluxo direto não disponível:', err?.message);
    } finally {
      setConnecting(false);
    }

    // Fallback: redireciona para a aba de Integrações nas Configurações
    if (onNavigateFallback) {
      onNavigateFallback('settings', 'integrations');
    } else if (typeof window !== 'undefined') {
      window.location.href = '/configuracoes?tab=integrations';
    }
  }, []);

  return {
    loading,
    connecting,
    status,
    googleCalendarConnected: status?.connected ?? false,
    isConfigured: status?.configured ?? false,
    refreshStatus: fetchStatus,
    connectGoogleCalendar,
  };
}
