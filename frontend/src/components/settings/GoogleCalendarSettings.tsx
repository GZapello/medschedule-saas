import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';
import { useGoogleCalendarStatus } from '../../hooks/useGoogleCalendarStatus';

const endpoint = '/v1/integrations/google-calendar';
export function GoogleCalendarSettings() {
  const { status, loading, connecting, connectGoogleCalendar, refreshStatus } = useGoogleCalendarStatus();
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [preferences, setPreferences] = useState({ calendar_id: 'primary', sync_enabled: true, sync_direction: 'both', block_external_events: true, create_google_meet: true, privacy_mode: 'private', sync_interval_option: 'future' });
  useEffect(() => {
    if (!status?.connected) { setCalendars([]); return; }
    setPreferences({ calendar_id: status.calendarId || 'primary', sync_enabled: !!status.syncEnabled, sync_direction: status.syncDirection || 'both', block_external_events: !!status.blockExternalEvents, create_google_meet: !!status.createGoogleMeet, privacy_mode: status.privacyMode || 'private', sync_interval_option: status.syncIntervalOption || 'future' });
    let active = true;
    ApiClient.get<{ calendars: typeof calendars }>(`${endpoint}/calendars`).then(result => { if (active) setCalendars(result.calendars); }).catch(() => { if (active) setMessage('Não foi possível listar suas agendas. Tente novamente ou reconecte a conta.'); });
    return () => { active = false; };
  }, [status]);
  async function run(action: () => Promise<string>) {
    setBusy(true); setMessage('');
    try { setMessage(await action()); await refreshStatus(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  }
  const control = 'w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm';
  const button = 'min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-50';
  return <section className="max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Integração Google Agenda">
    <h2 className="text-xl font-bold text-slate-900">Google Agenda e Meet</h2>
    <p className="text-sm text-slate-600">Conecte sua conta para sincronizar atendimentos, consultar disponibilidade e criar links Meet em consultas online. A conexão pertence a você nesta clínica.</p>
    <p className="text-sm text-slate-600">Solicitamos acesso aos eventos, à lista de agendas e à disponibilidade, além da identificação da conta. O título padrão é “Atendimento Zemda”; prontuários não são enviados aos eventos. Não solicitamos acesso ao Gmail ou ao Drive. <a href="/privacidade" target="_blank" rel="noreferrer" className="text-indigo-700 underline">Como usamos seus dados</a>.</p>
    {loading ? <p role="status">Consultando conexão…</p> : !status?.configured && !status?.connected ? <p role="alert">A integração precisa ser configurada pelo administrador antes de conectar.</p> : !status?.connected ? <button className={`${button} bg-indigo-600 text-white`} disabled={connecting || busy} onClick={connectGoogleCalendar}>{connecting ? 'Conectando…' : 'Conectar Google Agenda'}</button> : <>
      <p className="break-words text-sm">Conta conectada: <strong>{status.accountEmail}</strong></p>
      {status.lastSyncError && <p role="alert" className="text-sm text-amber-800">{status.lastSyncError}</p>}
      <p className="text-xs text-slate-600">{status.notificationsActive ? 'Notificações Google ativas.' : 'Notificações Google pendentes.'} {status.lastSyncAt && `Última sincronização: ${status.lastSyncAt} (UTC).`}</p>
      <form onSubmit={event => { event.preventDefault(); void run(async () => { await ApiClient.put(`${endpoint}/settings`, preferences); return 'Preferências salvas.'; }); }}>
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <label className="block text-sm font-medium">Agenda
            <select className={control} value={preferences.calendar_id} onChange={e => setPreferences({ ...preferences, calendar_id: e.target.value })}>
              <option value={status.calendarId || 'primary'}>{status.calendarName || 'Agenda principal'}</option>
              {calendars.filter(c => c.id !== status.calendarId && !(status.calendarId === 'primary' && c.primary)).map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}
            </select>
          </label>
          <p className="text-xs text-slate-600">Escolha a agenda antes de sincronizar. Para trocar uma agenda que já possui eventos vinculados, desconecte primeiro; os eventos existentes permanecem no Google.</p>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={preferences.sync_enabled} onChange={e => setPreferences({ ...preferences, sync_enabled: e.target.checked })} />Sincronização ativa</label>
          <label className="block text-sm font-medium">Direção
            <select aria-label="Direção" className={control} value={preferences.sync_direction} onChange={e => setPreferences({ ...preferences, sync_direction: e.target.value })}>
              <option value="both">Zemda ↔ Google</option>
              <option value="zemda_to_google">Zemda → Google</option>
              <option value="google_to_zemda">Google → Zemda</option>
            </select>
          </label>
          <p className="text-xs text-slate-600">Alterações recebidas do Google são apresentadas para revisão nos atendimentos vinculados. Eventos pessoais não viram atendimentos automaticamente.</p>
          <label className="block text-sm font-medium">Período de envio
            <select className={control} value={preferences.sync_interval_option} onChange={e => setPreferences({ ...preferences, sync_interval_option: e.target.value })}>
              <option value="future">Atendimentos futuros</option><option value="next_7_days">Próximos 7 dias</option><option value="next_30_days">Próximos 30 dias</option>
            </select>
          </label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={preferences.block_external_events} onChange={e => setPreferences({ ...preferences, block_external_events: e.target.checked })} />Bloquear horários ocupados no Google</label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={preferences.create_google_meet} onChange={e => setPreferences({ ...preferences, create_google_meet: e.target.checked })} />Criar Google Meet para consultas online sem link</label>
          <label className="block text-sm font-medium">Título dos eventos
            <select className={control} value={preferences.privacy_mode} onChange={e => setPreferences({ ...preferences, privacy_mode: e.target.value })}>
              <option value="private">Sem nome do paciente</option><option value="show_patient_name">Com nome do paciente</option>
            </select>
          </label>
          {preferences.privacy_mode === 'show_patient_name' && <p className="text-sm text-amber-800">O nome ficará visível a quem tiver acesso aos detalhes dessa agenda. Confirme que esse compartilhamento é adequado antes de salvar.</p>}
          <button className={button} type="submit">Salvar preferências</button>
        </fieldset>
      </form>
      <div className="flex flex-wrap gap-3">
        <button className={button} disabled={busy || !status.syncEnabled} onClick={() => void run(async () => (await ApiClient.post<{ message: string }>(`${endpoint}/sync`)).message)}>Sincronizar agora</button>
        <button className={button} disabled={busy} onClick={() => setConfirmDisconnect(true)}>Desconectar</button>
      </div>
      {confirmDisconnect && <div className="space-y-3 rounded-xl border border-amber-200 p-4">
        <p className="text-sm">Remover a conexão e seus vínculos locais? Os atendimentos Zemda e os eventos já criados no Google serão preservados. A revogação no Google pode afetar outras conexões da mesma conta com este aplicativo.</p>
        <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void run(async () => { const result = await ApiClient.delete<{ message: string }>(`${endpoint}/disconnect`); setConfirmDisconnect(false); return result.message; })}>Confirmar desconexão</button><button className={button} disabled={busy} onClick={() => setConfirmDisconnect(false)}>Cancelar</button></div>
      </div>}
    </>}
    {(busy || message) && <p role="status" className="text-sm text-slate-700">{busy ? 'Processando…' : message}</p>}
  </section>;
}
