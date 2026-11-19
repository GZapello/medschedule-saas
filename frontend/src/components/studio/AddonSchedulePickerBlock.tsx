import React, { useEffect, useState } from 'react';
import { AlertCircle, Calendar, Check, Clock, Trash2, UserRound, Users } from 'lucide-react';
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
  baseServiceId?: string | null;
  baseCommercialOptionId?: string | null;
  timeZone?: string | null;
  addon: StudioOptionalAddonOption;
  targetServiceMeta?: any;
  values: SelectedAddonSchedule[];
  onChange: (next: SelectedAddonSchedule[]) => void;
}

const todayIso = (tz?: string | null) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Sao_Paulo' }).format(new Date());

const formatShortDate = (iso: string) => {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(dt);
};

export function getRequiredAddonSlotsCount(addon: StudioOptionalAddonOption): number {
  if (addon.frequencyType === 'weekly' && addon.frequencyCount && addon.frequencyCount > 1) {
    return Math.min(7, addon.frequencyCount);
  }
  return 1;
}

export const AddonSchedulePickerBlock: React.FC<AddonSchedulePickerBlockProps> = ({
  tenantSlug,
  bookingSequence,
  baseServiceId,
  baseCommercialOptionId,
  timeZone,
  addon,
  targetServiceMeta,
  values,
  onChange
}) => {
  const requiredCount = getRequiredAddonSlotsCount(addon);
  const [date, setDate] = useState<string>(() => todayIso(timeZone));
  const [selectedProFilter, setSelectedProFilter] = useState<string>('any');
  const [availablePros, setAvailablePros] = useState<any[]>(() =>
    Array.isArray(targetServiceMeta?.linked_professionals) ? targetServiceMeta.linked_professionals : []
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [slots, setSlots] = useState<any[]>([]);
  const [upcomingSlots, setUpcomingSlots] = useState<any[]>([]);
  const [emptyReason, setEmptyReason] = useState<string>('');
  const [fetchErr, setFetchErr] = useState<string>('');

  useEffect(() => {
    setSelectedProFilter('any');
  }, [addon.id]);

  useEffect(() => {
    if (!tenantSlug || !addon.addonServiceId) return;
    let cancelled = false;
    setLoading(true);
    setFetchErr('');
    const seqParam = bookingSequence ? `&bookingSequence=${bookingSequence}` : '';
    const dateParam = date ? `&date=${encodeURIComponent(date)}` : '';
    const baseParam = baseServiceId ? `&baseServiceId=${encodeURIComponent(baseServiceId)}` : '';
    const baseOptParam = baseCommercialOptionId ? `&baseCommercialOptionId=${encodeURIComponent(baseCommercialOptionId)}` : '';
    const optParam = `&addonOptionId=${encodeURIComponent(addon.id)}`;
    const proParam = selectedProFilter && selectedProFilter !== 'any'
      ? `&professionalId=${encodeURIComponent(selectedProFilter)}`
      : '';
    ApiClient.get<any>(
      `/v1/public/studio/slots?tenantSlug=${encodeURIComponent(tenantSlug)}${seqParam}&serviceId=${encodeURIComponent(addon.addonServiceId)}${baseParam}${baseOptParam}${optParam}${proParam}${dateParam}&includeUpcoming=1&includeWeekly=0`
    )
      .then((res) => {
        if (cancelled) return;
        setSlots(Array.isArray(res?.slots) ? res.slots : []);
        setUpcomingSlots(Array.isArray(res?.upcomingSlots) ? res.upcomingSlots : []);
        if (Array.isArray(res?.professionals)) {
          setAvailablePros(res.professionals);
        }
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
  }, [tenantSlug, bookingSequence, baseServiceId, baseCommercialOptionId, addon.id, addon.addonServiceId, selectedProFilter, date]);

  const handleToggleSlot = (slotObj: any) => {
    if (slotObj?.isFull) return;
    const rawSchedId = typeof slotObj?.classScheduleId === 'string' && !slotObj.classScheduleId.startsWith('individual:')
      ? slotObj.classScheduleId
      : null;
    const modality: 'presential' | 'online' | 'home' =
      slotObj?.modality === 'online' || slotObj?.modality === 'home' ? slotObj.modality : 'presential';

    const nextItem: SelectedAddonSchedule = {
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
    };

    const existingIdx = values.findIndex(
      v => v.startTime === nextItem.startTime && v.professionalId === nextItem.professionalId
    );
    if (existingIdx >= 0) {
      onChange(values.filter((_, i) => i !== existingIdx));
      return;
    }

    if (requiredCount === 1) {
      onChange([nextItem]);
      return;
    }

    if (values.length >= requiredCount) {
      onChange([...values.slice(1), nextItem]);
      return;
    }
    onChange([...values, nextItem]);
  };

  const displayList = slots.filter(s => !s.isFull).length > 0
    ? slots
    : upcomingSlots.filter(s => !s.isFull).slice(0, 12);

  const allowProChoice = addon.professionalSelectionMode !== 'auto_assign' && availablePros.length > 1;

  return (
    <div className="p-3.5 rounded-2xl border border-teal-200 bg-white space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-teal-600" />
            {requiredCount > 1
              ? `Escolha ${requiredCount} horários semanais para: ${addon.label}`
              : `Escolha o 1º horário para: ${addon.label}`}
          </div>
          <p className="text-[11px] text-slate-500">
            Disponibilidade real do serviço {targetServiceMeta?.name || addon.addonServiceName || addon.label}
            {addon.attendanceFormat === 'duo'
              ? ' • Formato: Dupla (2 vagas)'
              : addon.attendanceFormat === 'group' && addon.sessionCapacity
                ? ` • Formato: Pequeno grupo (até ${addon.sessionCapacity} vagas)`
                : ''}.
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

      {/* Passo C: Escolha de Profissional habilitado (quando configurada seleção manual com 2+ profissionais) */}
      {allowProChoice && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
            <Users className="w-3 h-3 text-indigo-600" />
            Profissional para acompanhamento:
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedProFilter('any')}
              className={`px-2.5 py-1 rounded-full text-[11px] border font-semibold cursor-pointer ${
                selectedProFilter === 'any'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300'
              }`}
            >
              Qualquer disponível
            </button>
            {availablePros.map((pro: any) => (
              <button
                key={pro.id}
                type="button"
                onClick={() => setSelectedProFilter(pro.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] border font-semibold cursor-pointer ${
                  selectedProFilter === pro.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                }`}
              >
                {pro.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {addon.professionalSelectionMode === 'auto_assign' && availablePros.length > 0 && (
        <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
          Profissional será atribuído automaticamente entre os instrutores disponíveis ({availablePros.map((p: any) => p.name).join(', ')}).
        </div>
      )}

      {values.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-teal-800">
            {requiredCount > 1
              ? `Horários selecionados (${values.length} de ${requiredCount}):`
              : 'Horário selecionado:'}
          </div>
          {values.map((sel, idx) => (
            <div key={`${sel.startTime}-${sel.professionalId}-${idx}`} className="p-2 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-between gap-2">
              <div className="text-[11px] text-teal-900 font-semibold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span>
                  {formatShortDate(sel.startTime)} às {sel.startTime.slice(11, 16)} ({sel.professionalName})
                </span>
              </div>
              <button
                type="button"
                onClick={() => onChange(values.filter((_, i) => i !== idx))}
                className="text-[11px] font-bold text-rose-700 hover:text-rose-900 cursor-pointer flex items-center gap-0.5"
              >
                <Trash2 className="w-3 h-3" /> Remover
              </button>
            </div>
          ))}
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
          {emptyReason || 'Sem horários disponíveis para este complemento no momento. Escolha outra data ou continue somente com o plano-base.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {displayList.slice(0, 10).map((slotObj: any, idx: number) => {
            const isFull = Boolean(slotObj.isFull);
            const isPicked = values.some(
              v => v.startTime === slotObj.startTime && v.professionalId === slotObj.professionalId
            );
            return (
              <button
                key={`${slotObj.startTime}-${slotObj.professionalId}-${idx}`}
                type="button"
                disabled={isFull}
                onClick={() => handleToggleSlot(slotObj)}
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
