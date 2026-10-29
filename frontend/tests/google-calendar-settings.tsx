import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../src/context/ToastContext';
import { GoogleCalendarSettings } from '../src/components/settings/GoogleCalendarSettings';
import { ApiClient } from '../src/api/client';
const calls: any[] = [];
(window as any).__calls = calls;
let status: any = { configured: true, connected: true, accountEmail: 'profissional.teste@example.test', calendarId: 'primary', calendarName: 'Agenda principal', syncEnabled: true, syncDirection: 'both', blockExternalEvents: true, createGoogleMeet: true, privacyMode: 'private', syncIntervalOption: 'future', notificationsActive: true };
ApiClient.get = async (url: string) => {
  if (url.endsWith('/status')) return { ...status };
  if (url.endsWith('/calendars')) return { calendars: [{ id: 'primary', summary: 'Agenda principal', primary: true }, { id: 'second', summary: 'Agenda secundária com um nome comprido para testar responsividade', primary: false }] } as any;
  throw new Error(`Unexpected request: ${url}`);
};
ApiClient.put = async (url: string, body: any) => { calls.push({ url, body }); status = { ...status, syncDirection: body.sync_direction, syncEnabled: body.sync_enabled, privacyMode: body.privacy_mode }; return {} as any; };
ApiClient.post = async (url: string) => { calls.push({ url }); return { message: '3 atendimentos sincronizados; 1 pendência.' } as any; };
ApiClient.delete = async (url: string) => { calls.push({ url }); status.connected = false; return { revoked: false, message: 'Conexão local removida. Revogue o acesso na conta Google.' } as any; };
createRoot(document.getElementById('root')!).render(<ToastProvider><GoogleCalendarSettings /></ToastProvider>);
