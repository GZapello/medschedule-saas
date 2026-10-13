import React, { useEffect, useState } from 'react';
import { Copy, ExternalLink, Calendar, UserRound, Check, Building2, Loader2, AlertCircle } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { clinicBookingPath } from '../../utils/publicBooking';

export const BookingLinksContent: React.FC = () => {
  const { currentUser, currentTenant, isClinicAdmin, isProfessional, refreshTenant } = useAuth();
  const { showToast } = useToast();

  const [tenant, setTenant] = useState<any>(null);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [activatingClinic, setActivatingClinic] = useState<boolean>(false);

  const canManageClinicBooking = isClinicAdmin;

  const handleActivateClinicBooking = async () => {
    setActivatingClinic(true);
    try {
      await ApiClient.put('/v1/tenants/current', { publicBookingEnabled: true });
      const fresh = await ApiClient.get<any>('/v1/tenants/current');
      setTenant(fresh);
      if (refreshTenant) {
        await refreshTenant();
      }
      showToast('Página de agendamento da clínica ativada com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Não foi possível ativar a página de agendamento.', 'error');
    } finally {
      setActivatingClinic(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const loadTenant = ApiClient.get<any>('/v1/tenants/current').catch(() => null);

    const loadProfessionals = async () => {
      if (!isClinicAdmin && !isProfessional) {
        return [];
      }
      try {
        if (currentUser?.professionalId && !isClinicAdmin) {
          const res = await ApiClient.get<any>(`/v1/professionals/${currentUser.professionalId}`);
          return res?.professional ? [res.professional] : [];
        } else {
          const res = await ApiClient.get<any[]>('/v1/professionals');
          if (Array.isArray(res)) {
            return isClinicAdmin ? res : res.filter(p => p.user_id === currentUser?.id);
          }
          return [];
        }
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
        if (active) setError('Não foi possível carregar os links de agendamento.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentTenant?.id, currentUser?.id, currentUser?.professionalId, isClinicAdmin, isProfessional]);

  const handleCopy = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(`Link ${label} copiado!`, 'success');
    } catch {
      showToast('Não foi possível copiar. Selecione e copie o link manualmente.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        <span className="text-xs font-medium">Carregando links de agendamento...</span>
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
  const clinicPath = effectiveTenant ? clinicBookingPath(effectiveTenant) : null;
  const clinicUrl = clinicPath ? `${window.location.origin}${clinicPath}` : null;
  const isClinicEnabled = effectiveTenant?.public_booking_enabled === 1;

  const tenantSlug = effectiveTenant?.slug;

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      {/* 1. Link da Clínica */}
      <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 leading-tight">
                Página de Agendamento da Clínica
              </h4>
              <p className="text-[11px] text-slate-500">
                Página geral onde o paciente escolhe especialidade e profissional
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
              isClinicEnabled
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {isClinicEnabled && <Check className="w-3 h-3" />}
            {isClinicEnabled ? 'Ativo' : 'Desativado'}
          </span>
        </div>

        {isClinicEnabled && clinicUrl ? (
          <div className="space-y-2 pt-1 border-t border-slate-200/60">
            <input
              type="text"
              readOnly
              value={clinicUrl}
              className="w-full text-[11px] font-mono bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 select-all focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(clinicUrl, 'da clínica')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar link</span>
              </button>
              <a
                href={clinicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                <span>Abrir link</span>
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 pt-2 border-t border-slate-200/60">
            <p className="text-[11px] text-slate-500">
              A página pública da clínica permite que pacientes encontrem especialidades e agendem horários online.
            </p>
            {canManageClinicBooking ? (
              <button
                type="button"
                disabled={activatingClinic}
                onClick={handleActivateClinicBooking}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer w-full sm:w-auto"
              >
                {activatingClinic ? (
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
            ) : (
              <p className="text-[11px] text-slate-500 italic">
                A página de agendamento da clínica está desativada no momento.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 2. Links Individuais dos Profissionais */}
      {professionals.length > 0 && (
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
            {isClinicAdmin ? 'Links dos Profissionais' : 'Meu Link de Agendamento'}
          </h4>

          {professionals.map(p => {
            const profUrl = p.slug && tenantSlug ? `${window.location.origin}/agendar/${tenantSlug}/${p.slug}` : null;
            const isProfEnabled = p.public_booking_enabled === 1;
            const subtitle = [p.profession_name, p.specialty_custom || p.specialty_name].filter(Boolean).join(' · ');

            return (
              <div
                key={p.id}
                className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center shrink-0 border border-cyan-100">
                      <UserRound className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-900 leading-tight">
                        {p.name}
                      </h5>
                      {subtitle && (
                        <p className="text-[11px] text-slate-500">{subtitle}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      isProfEnabled
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {isProfEnabled && <Check className="w-3 h-3" />}
                    {isProfEnabled ? 'Ativo' : 'Desativado'}
                  </span>
                </div>

                {isProfEnabled && profUrl ? (
                  <div className="space-y-2 pt-1 border-t border-slate-200/60">
                    <input
                      type="text"
                      readOnly
                      value={profUrl}
                      className="w-full text-[11px] font-mono bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 select-all focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(profUrl, `de ${p.name}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar link</span>
                      </button>
                      <a
                        href={profUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                        <span>Abrir link</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-200/60">
                    {isProfEnabled
                      ? 'O link estará disponível após definir o link personalizado do profissional.'
                      : 'Página individual desativada.'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
