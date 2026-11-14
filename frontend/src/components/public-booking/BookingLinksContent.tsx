import React, { useEffect, useState } from 'react';
import {
  Copy,
  ExternalLink,
  UserRound,
  Check,
  Building2,
  Loader2,
  AlertCircle,
  Sparkles,
  Info,
  Power,
  Wrench
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { clinicBookingPath } from '../../utils/publicBooking';
import {
  EstablishmentProfile,
  normalizeEstablishmentProfile,
  supportsStudioFeatures
} from '../../utils/establishmentContext';

const PROFILE_LABELS: Record<EstablishmentProfile, string> = {
  clinic: 'Clínica / Consultório',
  studio: 'Studio / Academia',
  mixed: 'Estabelecimento Misto'
};

interface BookingLinksContentProps {
  onClose?: () => void;
}

export const BookingLinksContent: React.FC<BookingLinksContentProps> = ({ onClose }) => {
  const {
    currentUser,
    currentTenant,
    isClinicAdmin,
    isProfessional,
    isReceptionist,
    hasPermission,
    refreshTenant
  } = useAuth();
  const { showToast } = useToast();

  const [tenant, setTenant] = useState<any>(null);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [togglingClinic, setTogglingClinic] = useState<boolean>(false);
  const [togglingProfId, setTogglingProfId] = useState<string | null>(null);

  const canManageClinicBooking = isClinicAdmin;
  const canManageServices = isClinicAdmin || hasPermission('manage_services');

  const handleToggleClinicBooking = async (nextEnabled: boolean) => {
    if (!canManageClinicBooking || togglingClinic) return;
    setTogglingClinic(true);
    try {
      await ApiClient.put('/v1/tenants/current', { publicBookingEnabled: nextEnabled });
      const fresh = await ApiClient.get<any>('/v1/tenants/current').catch(() => null);
      if (fresh) {
        setTenant(fresh);
      } else {
        setTenant((prev: any) => ({ ...(prev || currentTenant), public_booking_enabled: nextEnabled ? 1 : 0 }));
      }
      if (refreshTenant) {
        await refreshTenant();
      }
      showToast(
        nextEnabled
          ? 'Agendamento online do estabelecimento ativado!'
          : 'Agendamento online do estabelecimento desativado.',
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível atualizar o status do agendamento online.', 'error');
    } finally {
      setTogglingClinic(false);
    }
  };

  const handleToggleProfessionalBooking = async (prof: any, nextEnabled: boolean) => {
    const canManageProf =
      isClinicAdmin ||
      (isProfessional && (prof.user_id === currentUser?.id || prof.id === currentUser?.professionalId));
    if (!canManageProf || togglingProfId) return;

    setTogglingProfId(prof.id);
    try {
      await ApiClient.put(`/v1/professionals/${prof.id}`, { publicBookingEnabled: nextEnabled });
      setProfessionals(prev =>
        prev.map(item => (item.id === prof.id ? { ...item, public_booking_enabled: nextEnabled ? 1 : 0 } : item))
      );
      showToast(
        nextEnabled
          ? `Agendamento público de ${prof.name} ativado!`
          : `Agendamento público de ${prof.name} desativado.`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível alterar o agendamento deste profissional.', 'error');
    } finally {
      setTogglingProfId(null);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const loadTenant = ApiClient.get<any>('/v1/tenants/current').catch(() => null);

    const loadProfessionals = async () => {
      try {
        if (currentUser?.professionalId && !isClinicAdmin) {
          const res = await ApiClient.get<any>(`/v1/professionals/${currentUser.professionalId}`);
          return res?.professional ? [res.professional] : [];
        }
        const res = await ApiClient.get<any[]>('/v1/professionals');
        if (!Array.isArray(res)) return [];
        if (isClinicAdmin) return res;
        if (isProfessional) {
          return res.filter(p => p.user_id === currentUser?.id);
        }
        // Recepção e demais perfis consultam apenas links públicos ativos em modo leitura
        return res.filter(p => p.active !== 0 && p.public_booking_enabled === 1 && p.slug);
      } catch {
        return [];
      }
    };

    Promise.all([loadTenant, loadProfessionals()])
      .then(([tenantData, profsData]) => {
        if (!active) return;
        setTenant(tenantData || currentTenant);
        setProfessionals(profsData || []);
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar os dados do Agendamento Online.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentTenant?.id, currentUser?.id, currentUser?.professionalId, isClinicAdmin, isProfessional, isReceptionist]);

  const handleCopy = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(`Link ${label} copiado!`, 'success');
    } catch {
      showToast('Não foi possível copiar. Selecione e copie o link manualmente.', 'error');
    }
  };

  const handleOpenServices = () => {
    onClose?.();
    window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'services' } }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        <span className="text-xs font-medium">Carregando Agendamento Online...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  const effectiveTenant = tenant || currentTenant;
  const profile = normalizeEstablishmentProfile(effectiveTenant?.establishment_profile);
  const isStudioCompatible = supportsStudioFeatures(profile);
  const clinicPath = effectiveTenant ? clinicBookingPath(effectiveTenant) : null;
  const clinicUrl = clinicPath ? `${window.location.origin}${clinicPath}` : null;
  const isClinicEnabled = effectiveTenant?.public_booking_enabled === 1;
  const tenantSlug = effectiveTenant?.slug;
  const establishmentTitle = effectiveTenant?.trade_name || effectiveTenant?.name || 'Estabelecimento';

  return (
    <div className="space-y-3.5 max-h-[68vh] overflow-y-auto pr-0.5 min-w-0">
      {/* 1. Página Pública do Estabelecimento */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-3 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h4 className="text-xs font-bold text-slate-900 leading-tight truncate max-w-full">
                  Página do Estabelecimento — {establishmentTitle}
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold shrink-0">
                  {PROFILE_LABELS[profile]}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isStudioCompatible
                  ? 'Link principal com aulas coletivas, turmas, serviços individuais e pacotes.'
                  : 'Página geral onde o paciente escolhe especialidade, profissional e horário.'}
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
              isClinicEnabled
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-200/80 text-slate-600'
            }`}
          >
            {isClinicEnabled && <Check className="w-3 h-3" />}
            {isClinicEnabled ? 'Ativo' : 'Desativado'}
          </span>
        </div>

        {isStudioCompatible && (
          <div className="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200/80 text-[11px] text-teal-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-1.5 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
              <span>
                Disponibiliza publicamente turmas semanais, vagas em tempo real, aulas individuais e pacotes configurados em <strong>Serviços</strong>.
              </span>
            </div>
            {canManageServices && (
              <button
                type="button"
                onClick={handleOpenServices}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-teal-100/60 border border-teal-200 text-teal-800 font-bold text-[11px] shrink-0 cursor-pointer self-start sm:self-auto"
              >
                <Wrench className="w-3 h-3" />
                Serviços e pacotes
              </button>
            )}
          </div>
        )}

        {isClinicEnabled && clinicUrl ? (
          <div className="space-y-2.5 pt-2 border-t border-slate-200/70 min-w-0">
            <input
              type="text"
              readOnly
              value={clinicUrl}
              aria-label="URL pública do estabelecimento"
              className="w-full min-w-0 text-[11px] font-mono bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 select-all focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(clinicUrl, 'do estabelecimento')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar link</span>
                </button>
                <a
                  href={clinicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                  <span>Visualizar página</span>
                </a>
              </div>

              {canManageClinicBooking && (
                <button
                  type="button"
                  disabled={togglingClinic}
                  onClick={() => handleToggleClinicBooking(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {togglingClinic ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                  <span>Desativar</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 pt-2 border-t border-slate-200/70">
            <p className="text-[11px] text-slate-500">
              A página pública de agendamento do estabelecimento está desativada no momento.
            </p>
            {canManageClinicBooking && (
              <button
                type="button"
                disabled={togglingClinic}
                onClick={() => handleToggleClinicBooking(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[38px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer w-full sm:w-auto"
              >
                {togglingClinic ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Ativando página...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Ativar página de agendamento</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. Links Individuais dos Profissionais */}
      {professionals.length > 0 && (
        <div className="space-y-2.5 pt-2 border-t border-slate-100 min-w-0">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {isClinicAdmin
                ? 'Links dos Profissionais'
                : isProfessional
                ? 'Meu Link Individual de Agendamento'
                : 'Links Individuais Disponíveis'}
            </h4>
            <span className="text-[11px] font-semibold text-slate-400">
              {professionals.length} {professionals.length === 1 ? 'profissional' : 'profissionais'}
            </span>
          </div>

          {professionals.map(p => {
            const profUrl = p.slug && tenantSlug ? `${window.location.origin}/agendar/${tenantSlug}/${p.slug}` : null;
            const isProfEnabled = p.public_booking_enabled === 1;
            const subtitle = [p.profession_name, p.specialty_custom || p.specialty_name].filter(Boolean).join(' · ');
            const canToggleProf =
              isClinicAdmin ||
              (isProfessional && (p.user_id === currentUser?.id || p.id === currentUser?.professionalId));
            const isSavingThis = togglingProfId === p.id;

            return (
              <div
                key={p.id}
                className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2.5 min-w-0"
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center shrink-0 border border-cyan-100">
                      <UserRound className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h5 className="text-xs font-bold text-slate-900 leading-tight truncate">
                        {p.name}
                      </h5>
                      {subtitle && (
                        <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      isProfEnabled
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {isProfEnabled && <Check className="w-3 h-3" />}
                    {isProfEnabled ? 'Ativo' : 'Desativado'}
                  </span>
                </div>

                {isProfEnabled && profUrl ? (
                  <div className="space-y-2 pt-1 border-t border-slate-200/60 min-w-0">
                    <input
                      type="text"
                      readOnly
                      value={profUrl}
                      aria-label={`URL pública de ${p.name}`}
                      className="w-full min-w-0 text-[11px] font-mono bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 select-all focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(profUrl, `de ${p.name}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar link</span>
                        </button>
                        <a
                          href={profUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                          <span>Visualizar página</span>
                        </a>
                      </div>

                      {canToggleProf && (
                        <button
                          type="button"
                          disabled={Boolean(togglingProfId)}
                          onClick={() => handleToggleProfessionalBooking(p, false)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isSavingThis ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                          <span>Desativar</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60">
                    <p className="text-[11px] text-slate-500 italic">
                      {isProfEnabled
                        ? 'Link aguardando slug do perfil profissional.'
                        : 'Página individual desativada.'}
                    </p>
                    {canToggleProf && !isProfEnabled && (
                      <button
                        type="button"
                        disabled={Boolean(togglingProfId)}
                        onClick={() => handleToggleProfessionalBooking(p, true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isSavingThis ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span>Ativar link individual</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Orientações de Uso */}
      <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100 text-[11px] text-slate-600 space-y-1">
        <p className="font-bold text-indigo-900 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          Dicas rápidas de uso
        </p>
        <p>• Compartilhe o link do estabelecimento no Instagram, WhatsApp ou site oficial.</p>
        <p>• Garanta que profissionais e turmas estejam com escala, serviços e vagas ativos para aparecerem disponíveis.</p>
        {!isClinicAdmin && !isProfessional && (
          <p>• Como recepção/equipe de atendimento, você pode copiar e conferir os links ativos para enviar aos pacientes.</p>
        )}
      </div>
    </div>
  );
};
