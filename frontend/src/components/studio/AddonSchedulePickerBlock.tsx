import React, { useEffect, useState } from 'react';
import { AlertCircle, Calendar, Check, Clock, UserRound } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { StudioOptionalAddonOption } from '../../utils/studioAccessAndCommercial';

export interface SelectedAddonSchedule {
  optionId: string;
  addonLabel: string;
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
  classScheduleId?: string | null;
  modality: 'presential' | 'online' | 'home';
  startTime: string;
  endTime: string;
  roomName?: string | null;
}

interface AddonSchedulePickerBlockProps {
  tenantSlug: string;
  bookingSequence?: number;
  addon: StudioOptionalAddonOption;
  targetServiceMeta?: any;
  value?: SelectedAddonSchedule | null;
  onChange: (next: SelectedAddonSchedule | null) => void;
}

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const formatShortDate = (iso: string) => {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(dt);
};

export const AddonSchedulePickerBlock: React.FC<AddonSchedulePickerBlockProps> = ({
  tenantSlug,
  bookingSequence,
  addon,
  targetServiceMeta,
  value,
  onChange
}) => {
  const [date, setDate] = useState<string>(() => todayIso());
  const [loading, setLoading] = useState<boolean>(false);
  const [slots, setSlots] = useState<any[]>([]);
  const [upcomingSlots, setUpcomingSlots] = useState<any[]>([]);
  const [emptyReason, setEmptyReason] = useState<string>('');
  const [fetchErr, setFetchErr] = useState<string>('');

  useEffect(() => {
    if (!tenantSlug || !addon.addonServiceId) return;
    let cancelled = false;
    setLoading(true);
    setFetchErr('');
    const seqParam = bookingSequence ? `&bookingSequence=${bookingSequence}` : '';
    const dateParam = date ? `&date=${encodeURIComponent(date)}` : '';
    ApiClient.get<any>(
      `/v1/public/studio/slots?tenantSlug=${encodeURIComponent(tenantSlug)}${seqParam}&serviceId=${encodeURIComponent(addon.addonServiceId)}${dateParam}&includeUpcoming=1&includeWeekly=0`
    )
      .then((res) => {
        if (cancelled) return;
        setSlots(Array.isArray(res?.slots) ? res.slots : []);
        setUpcomingSlots(Array.isArray(res?.upcomingSlots) ? res.upcomingSlots : []);
        setEmptyReason(res?.emptyReason || '');
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchErr(err?.message || 'Não foi possível carregar horários disponíveis deste complemento.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, bookingSequence, addon.addonServiceId, date]);

  const handlePickSlot = (slotObj: any) => {
    if (slotObj?.isFull) return;
    const rawSchedId = typeof slotObj?.classScheduleId === 'string' && !slotObj.classScheduleId.startsWith('individual:')
      ? slotObj.classScheduleId
      : null;
    const modality: 'presential' | 'online' | 'home' =
      slotObj?.modality === 'online' || slotObj?.modality === 'home' ? slotObj.modality : 'presential';
    onChange({
      optionId: addon.id,
      addonLabel: addon.label,
      serviceId: addon.addonServiceId,
      serviceName: targetServiceMeta?.name || addon.addonServiceName || addon.label,
      professionalId: slotObj.professionalId,
      professionalName: slotObj.professionalName || 'Instrutor',
      classScheduleId: rawSchedId,
      modality,
      startTime: slotObj.startTime,
      endTime: slotObj.endTime,
      roomName: slotObj.roomName || null
    });
  };

  const displayList = slots.filter(s => !s.isFull).length > 0
    ? slots
    : upcomingSlots.filter(s => !s.isFull).slice(0, 8);

  return (
    <div className="p-3.5 rounded-2xl border border-teal-200 bg-white space-y-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-teal-600" />
            Escolha o 1º horário para: {addon.label}
          </div>
          <p className="text-[11px] text-slate-500">
            Disponibilidade e vagas reais do serviço {targetServiceMeta?.name || addon.addonServiceName || addon.label}.
          </p>
        </div>
        <input
          type="date"
          min={todayIso()}
          value={date}
          onChange={e => setDate(e.target.value || todayIso())}
          className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-slate-50 font-semibold"
          aria-label={`Data para ${addon.label}`}
        />
      </div>

      {value && (
        <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-between gap-2">
          <div className="text-[11px] text-teal-900 font-semibold flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-teal-700 shrink-0" />
            <span>
              Horário selecionado: {formatShortDate(value.startTime)} às {value.startTime.slice(11, 16)} ({value.professionalName})
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] font-bold text-teal-800 underline cursor-pointer"
          >
            Trocar
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-3 text-center text-slate-500">Consultando horários disponíveis...</div>
      ) : fetchErr ? (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{fetchErr}</span>
        </div>
      ) : displayList.length === 0 ? (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
          {emptyReason || 'Sem horários livres para a data selecionada. Tente escolher outro dia acima.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {displayList.slice(0, 8).map((slotObj: any, idx: number) => {
            const isFull = Boolean(slotObj.isFull);
            const isPicked =
              value &&
              value.startTime === slotObj.startTime &&
              value.professionalId === slotObj.professionalId;
            return (
              <button
                key={`${slotObj.startTime}-${slotObj.professionalId}-${idx}`}
                type="button"
                disabled={isFull}
                onClick={() => handlePickSlot(slotObj)}
                className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 ${
                  isFull
                    ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                    : isPicked
                      ? 'border-teal-600 bg-teal-50 ring-2 ring-teal-500/20 cursor-pointer'
                      : 'border-slate-200 bg-white hover:border-teal-400 cursor-pointer'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-teal-600" />
                    {formatShortDate(slotObj.startTime)} • {String(slotObj.startTime).slice(11, 16)}
                  </div>
                  <div className="text-[10px] text-slate-600 flex items-center gap-1">
                    <UserRound className="w-3 h-3 text-slate-400" />
                    {slotObj.professionalName || 'Instrutor'}
                  </div>
                </div>
                {typeof slotObj.remainingSpots === 'number' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">
                    {isFull ? 'Lotado' : `${slotObj.remainingSpots} vaga(s)`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
