import React, { useState, useEffect, useCallback } from 'react';
import { ApiClient as api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  BellRing,
  X,
  CheckCircle2,
  AlertCircle,
  Users,
  Clock,
  SlidersHorizontal
} from 'lucide-react';

export interface CheckInSettingsData {
  clinicCheckinEnabled: boolean;
  hasReceptionTeam: boolean;
  receptionStaffCount: number;
  professionalId: string | null;
  alertsEnabled: boolean;
  configuredAlertsPreference: boolean;
  soundEnabled: boolean;
  soundPreference: boolean;
  explanation: string | null;
}

export const CheckInConfigPanel: React.FC<{
  onSaved?: () => void;
}> = ({ onSaved }) => {
  const { currentUser: user } = useAuth();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<CheckInSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<CheckInSettingsData>('/v1/checkin/settings');
      setSettings(data);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar configurações de Check-In', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggleAlerts = async (nextVal: boolean) => {
    if (!settings) return;
    if (nextVal && !settings.hasReceptionTeam) {
      showToast(
        'Sua clínica ainda não possui recepcionista cadastrado(a). Cadastre a equipe de recepção antes de ativar os avisos automáticos.',
        'info'
      );
      return;
    }

    setSaving(true);
    try {
      const res = await api.put<any>('/v1/checkin/settings', {
        alertsEnabled: nextVal,
        soundEnabled: false
      });
      setSettings(prev =>
        prev
          ? {
              ...prev,
              alertsEnabled: Boolean(res.alertsEnabled),
              configuredAlertsPreference: Boolean(res.alertsEnabled)
            }
          : prev
      );
      showToast(res.message || 'Preferências de Check-In atualizadas!', 'success');
      window.dispatchEvent(new CustomEvent('zemda-checkin-updated'));
      onSaved?.();
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível atualizar o Check-In', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleClinicAvailability = async (nextClinicVal: boolean) => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.put('/v1/checkin/settings', {
        alertsEnabled: settings.alertsEnabled,
        clinicCheckinEnabled: nextClinicVal
      });
      setSettings(prev => (prev ? { ...prev, clinicCheckinEnabled: nextClinicVal } : prev));
      showToast(
        nextClinicVal
          ? 'Fluxo de Check-In habilitado para a clínica.'
          : 'Fluxo de Check-In desativado na clínica.',
        'success'
      );
      window.dispatchEvent(new CustomEvent('zemda-checkin-updated'));
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar disponibilidade na clínica', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-xs text-slate-400">
        Carregando configurações de Check-In...
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-100 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
          <BellRing className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-800">
            Avisos de chegada em tempo real
          </p>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
            Receba um aviso discreto na tela quando a recepção registrar a chegada de um paciente agendado para você e acompanhe a fila de espera no seu painel.
          </p>
        </div>
      </div>

      {!settings.hasReceptionTeam ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-900">
              Recepção ainda não cadastrada nesta clínica
            </p>
            <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
              {settings.explanation ||
                'Sua clínica ainda não possui recepcionista cadastrado(a). O aviso automático de chegada funciona quando a recepção registra a chegada do paciente.'}
            </p>
            {user?.role === 'clinic_admin' && (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'staff' } }));
                }}
                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" /> Cadastrar Recepção em Equipe
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl border border-slate-200 bg-white flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-800">
              Receber avisos flutuantes de chegada
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Exibe notificação silenciosa apenas para pacientes sob sua responsabilidade ({settings.receptionStaffCount} profissional(is) de recepção ativo(s)).
            </p>
          </div>
          <button
            type="button"
            disabled={saving || !settings.clinicCheckinEnabled}
            onClick={() => handleToggleAlerts(!settings.alertsEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              settings.alertsEnabled ? 'bg-teal-600' : 'bg-slate-200'
            } ${saving ? 'opacity-50' : ''}`}
            role="switch"
            aria-checked={settings.alertsEnabled}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                settings.alertsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {user?.role === 'clinic_admin' && (
        <div className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-700">
              Disponibilidade do Check-In na Clínica
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Permite que a recepção e os profissionais utilizem os status de chegada e fila de espera.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleToggleClinicAvailability(!settings.clinicCheckinEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              settings.clinicCheckinEnabled ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
            role="switch"
            aria-checked={settings.clinicCheckinEnabled}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                settings.clinicCheckinEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
        <span>
          Os avisos são silenciosos por padrão, não bloqueiam o prontuário e você pode alterá-los a qualquer momento no Painel Operacional ou na Central de Ajuda.
        </span>
      </div>
    </div>
  );
};

export const CheckInFloatingAlert: React.FC = () => {
  const { currentUser: user } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const canPoll =
    Boolean(user) &&
    (user?.role === 'professional' || user?.role === 'clinic_admin');

  const fetchAlerts = useCallback(async () => {
    if (!canPoll) return;
    try {
      const data = await api.get<{
        hasReceptionTeam?: boolean;
        clinicCheckinEnabled?: boolean;
        alertsEnabled: boolean;
        activeAlerts: any[];
      }>('/v1/checkin/queue');
      if (
        data &&
        data.hasReceptionTeam &&
        data.clinicCheckinEnabled !== false &&
        data.alertsEnabled &&
        Array.isArray(data.activeAlerts)
      ) {
        setActiveAlerts(data.activeAlerts);
      } else {
        setActiveAlerts([]);
      }
    } catch {
      // Silencioso para não interferir na navegação
    }
  }, [canPoll]);

  useEffect(() => {
    if (!canPoll) return;
    fetchAlerts();
    const timer = window.setInterval(fetchAlerts, 12000);
    const onRefresh = () => {
      fetchAlerts();
    };
    const onOpenSettings = () => {
      setConfigModalOpen(true);
    };
    window.addEventListener('zemda-checkin-updated', onRefresh);
    window.addEventListener('zemda-open-checkin-settings', onOpenSettings);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('zemda-checkin-updated', onRefresh);
      window.removeEventListener('zemda-open-checkin-settings', onOpenSettings);
    };
  }, [canPoll, fetchAlerts]);

  const handleDismiss = async (alertId: string) => {
    setActiveAlerts(prev => prev.filter(a => a.id !== alertId));
    try {
      await api.post(`/v1/checkin/alerts/${alertId}/dismiss`, {});
      window.dispatchEvent(new CustomEvent('zemda-checkin-updated'));
    } catch {
      // Ignora erro de rede no fechamento
    }
  };

  return (
    <>
      {/* Avisos flutuantes discretos (não bloqueantes, sem som por padrão, botão de fechar imediato) */}
      {activeAlerts.length > 0 && (
        <div
          className="fixed bottom-5 right-5 z-[9980] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
          aria-live="polite"
        >
          {activeAlerts.slice(0, 3).map(alert => (
            <div
              key={alert.id}
              className="pointer-events-auto bg-white/95 backdrop-blur-md border border-teal-200 shadow-xl rounded-2xl p-3.5 flex items-start gap-3 animate-in slide-in-from-bottom-3 duration-200"
            >
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shrink-0 mt-0.5">
                <BellRing className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700">
                    Check-In na Recepção
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-900 mt-0.5 leading-snug">
                  {alert.message}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'dashboard' } }));
                      handleDismiss(alert.id);
                    }}
                    className="text-[11px] font-bold text-teal-700 hover:text-teal-900 cursor-pointer flex items-center gap-1"
                  >
                    <Clock className="w-3 h-3" /> Ver no painel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismiss(alert.id)}
                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Fechar aviso
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDismiss(alert.id)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Fechar aviso imediatamente"
                aria-label="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal rápido de configuração de Check-In acessível fora da Central de Ajuda */}
      {configModalOpen && (
        <div className="fixed inset-0 z-[9992] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Configurar Check-In</h3>
                  <p className="text-[11px] text-slate-500">Preferências de chegada e avisos em tempo real</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <CheckInConfigPanel />
          </div>
        </div>
      )}
    </>
  );
};
