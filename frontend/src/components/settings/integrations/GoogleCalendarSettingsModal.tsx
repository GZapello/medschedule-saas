import React, { useState, useEffect } from 'react';
import { X, Calendar, Check, Shield, Video, Clock, Loader2, Sparkles } from 'lucide-react';
import { ApiClient } from '../../../api/client';
import { useToast } from '../../../context/ToastContext';

interface CalendarOption {
  id: string;
  summary: string;
  primary?: boolean;
  description?: string | null;
}

interface GoogleCalendarSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: {
    calendarId?: string;
    calendarName?: string;
    syncEnabled?: boolean;
    blockExternalEvents?: boolean;
    createGoogleMeet?: boolean;
    privacyMode?: 'private' | 'show_patient_name';
    syncIntervalOption?: 'future' | 'next_7_days' | 'next_30_days';
  };
  onSaveSuccess: () => void;
}

export const GoogleCalendarSettingsModal: React.FC<GoogleCalendarSettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSaveSuccess
}) => {
  const { showToast } = useToast();

  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedCalendarId, setSelectedCalendarId] = useState<string>(currentSettings.calendarId || 'primary');
  const [selectedCalendarName, setSelectedCalendarName] = useState<string>(currentSettings.calendarName || 'Agenda principal');
  const [syncEnabled, setSyncEnabled] = useState<boolean>(currentSettings.syncEnabled ?? true);
  const [blockExternalEvents, setBlockExternalEvents] = useState<boolean>(currentSettings.blockExternalEvents ?? true);
  const [createGoogleMeet, setCreateGoogleMeet] = useState<boolean>(currentSettings.createGoogleMeet ?? true);
  const [privacyMode, setPrivacyMode] = useState<'private' | 'show_patient_name'>(currentSettings.privacyMode || 'private');
  const [syncIntervalOption, setSyncIntervalOption] = useState<'future' | 'next_7_days' | 'next_30_days'>(
    currentSettings.syncIntervalOption || 'future'
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedCalendarId(currentSettings.calendarId || 'primary');
      setSelectedCalendarName(currentSettings.calendarName || 'Agenda principal');
      setSyncEnabled(currentSettings.syncEnabled ?? true);
      setBlockExternalEvents(currentSettings.blockExternalEvents ?? true);
      setCreateGoogleMeet(currentSettings.createGoogleMeet ?? true);
      setPrivacyMode(currentSettings.privacyMode || 'private');
      setSyncIntervalOption(currentSettings.syncIntervalOption || 'future');

      loadCalendars();
    }
  }, [isOpen, currentSettings]);

  const loadCalendars = async () => {
    try {
      setLoadingCalendars(true);
      const res = await ApiClient.get<{ calendars: CalendarOption[] }>('/v1/integrations/google-calendar/calendars');
      if (res && res.calendars) {
        setCalendars(res.calendars);
      }
    } catch (err: any) {
      console.warn('Erro ao listar agendas Google:', err);
    } finally {
      setLoadingCalendars(false);
    }
  };

  const handleCalendarChange = (calId: string) => {
    setSelectedCalendarId(calId);
    const found = calendars.find(c => c.id === calId);
    if (found) {
      setSelectedCalendarName(found.summary);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await ApiClient.put('/v1/integrations/google-calendar/settings', {
        calendar_id: selectedCalendarId,
        calendar_name: selectedCalendarName,
        sync_enabled: syncEnabled,
        block_external_events: blockExternalEvents,
        create_google_meet: createGoogleMeet,
        privacy_mode: privacyMode,
        sync_interval_option: syncIntervalOption
      });

      showToast('Configurações da Google Agenda salvas com sucesso!', 'success');
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar configurações Google Agenda:', err);
      showToast(err?.message || 'Erro ao salvar configurações', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shadow-2xs">
              <Calendar className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Configurações da Google Agenda</h3>
              <p className="text-slate-500 text-xs">Personalize a sincronização e a privacidade dos seus atendimentos</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs text-slate-700">
          {/* 1. Seleção da Agenda */}
          <div className="space-y-2">
            <label className="block font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              Agenda Selecionada
            </label>
            <p className="text-[11px] text-slate-500">
              Escolha em qual agenda do seu Google os atendimentos do Zemda serão registrados e consultados.
            </p>

            {loadingCalendars ? (
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Carregando suas agendas do Google...</span>
              </div>
            ) : calendars.length > 0 ? (
              <select
                value={selectedCalendarId}
                onChange={e => handleCalendarChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
              >
                {calendars.map(cal => (
                  <option key={cal.id} value={cal.id}>
                    {cal.primary ? `Principal — ${cal.summary}` : cal.summary}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-700">
                {selectedCalendarName || 'Agenda principal'}
              </div>
            )}
          </div>

          {/* 2. Regras de Sincronização */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Regras de Sincronização
            </h4>

            <div className="space-y-2.5">
              <label className="flex items-start gap-2.5 p-3 rounded-2xl border border-slate-200 hover:border-indigo-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={syncEnabled}
                  onChange={e => setSyncEnabled(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-bold text-slate-900 block text-xs">
                    Sincronizar atendimentos do Zemda com Google Agenda
                  </span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    Cria automaticamente novos eventos no Google quando um agendamento for realizado no Zemda.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl border border-slate-200 hover:border-indigo-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={syncEnabled}
                  disabled
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 opacity-60"
                />
                <div>
                  <span className="font-bold text-slate-900 block text-xs">
                    Atualizar Google Agenda quando remarcar no Zemda
                  </span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    Modificações de data e horário no Zemda atualizam automaticamente o evento correspondente no Google.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl border border-slate-200 hover:border-indigo-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={syncEnabled}
                  disabled
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 opacity-60"
                />
                <div>
                  <span className="font-bold text-slate-900 block text-xs">
                    Remover evento Google quando atendimento for cancelado
                  </span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    Ao cancelar uma consulta no Zemda, o evento é desmarcado/removido na sua agenda Google.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl border border-slate-200 hover:border-indigo-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={blockExternalEvents}
                  onChange={e => setBlockExternalEvents(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-bold text-slate-900 block text-xs">
                    Considerar compromissos do Google como indisponibilidade no Zemda
                  </span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    Compromissos pessoais bloqueiam horários na escala do Zemda como "Indisponível por compromisso externo", sem expor títulos ou detalhes.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl border border-slate-200 hover:border-indigo-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={createGoogleMeet}
                  onChange={e => setCreateGoogleMeet(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-bold text-slate-900 block text-xs flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-indigo-600" />
                    Criar Google Meet automaticamente para atendimentos online
                  </span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    Gera link único de videochamada do Meet para teleconsultas e salva diretamente no agendamento do Zemda.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 3. Privacidade dos Eventos no Google */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              Privacidade do Paciente (LGPD)
            </h4>
            <p className="text-[11px] text-slate-500">
              Dados clínicos, prontuário, CPF e diagnósticos <strong>nunca</strong> são enviados ao Google.
            </p>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-3 rounded-2xl border border-slate-200 hover:border-indigo-200 bg-slate-50/50 cursor-pointer">
                <input
                  type="radio"
                  name="privacy_mode"
                  value="private"
                  checked={privacyMode === 'private'}
                  onChange={() => setPrivacyMode('private')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-bold text-slate-900 block text-xs flex items-center gap-1.5">
                    Mostrar somente "Atendimento Zemda"
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      Padrão Seguro
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    O Google exibirá apenas o horário ocupado e o título genérico, preservando a identidade do paciente.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl border border-slate-200 hover:border-indigo-200 bg-slate-50/50 cursor-pointer">
                <input
                  type="radio"
                  name="privacy_mode"
                  value="show_patient_name"
                  checked={privacyMode === 'show_patient_name'}
                  onChange={() => setPrivacyMode('show_patient_name')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-bold text-slate-900 block text-xs">
                    Mostrar nome do paciente no Google Agenda
                  </span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    O título do evento será: "Atendimento Zemda — [Nome do Paciente]".
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 4. Janela de Sincronização */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              Janela de Sincronização
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'future', label: 'A partir de hoje' },
                { id: 'next_7_days', label: 'Próximos 7 dias' },
                { id: 'next_30_days', label: 'Próximos 30 dias' }
              ].map(opt => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setSyncIntervalOption(opt.id as any)}
                  className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all ${
                    syncIntervalOption === opt.id
                      ? 'border-indigo-600 bg-indigo-50/70 text-indigo-700 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Salvar Configurações</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
