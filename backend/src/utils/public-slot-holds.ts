import { db } from '../config/database';

export interface PublicSlotHoldEntry {
  requestId: string;
  serviceId: string;
  professionalId: string | null;
  classScheduleId: string | null;
  startIso: string;
  endIso: string;
}

function normalizeIsoWindow(iso?: string | null): string {
  if (!iso) return '';
  return String(iso).trim().replace(' ', 'T').slice(0, 19);
}

/**
 * Retorna reservas temporárias ativas (aguardando confirmação e não expiradas)
 * para impedir que dois alunos no link público reservem simultaneamente a mesma vaga/horário.
 */
export function getActivePendingSlotHolds(
  tenantId: string,
  opts?: { datePrefix?: string; excludeRequestId?: string }
): PublicSlotHoldEntry[] {
  const rows = db.prepare(`
    SELECT id, service_id, professional_id, class_schedule_id, start_time, end_time, schedules_json
    FROM public_booking_requests
    WHERE tenant_id = ?
      AND status = 'awaiting_confirmation'
      AND (
        (hold_expires_at IS NOT NULL AND hold_expires_at > datetime('now'))
        OR (hold_expires_at IS NULL AND created_at >= datetime('now', '-15 minutes'))
      )
  `).all(tenantId) as Array<{
    id: string;
    service_id: string | null;
    professional_id: string | null;
    class_schedule_id: string | null;
    start_time: string | null;
    end_time: string | null;
    schedules_json: string | null;
  }>;

  const dateFilter = opts?.datePrefix ? String(opts.datePrefix).slice(0, 10) : null;
  const out: PublicSlotHoldEntry[] = [];

  for (const r of rows) {
    if (opts?.excludeRequestId && r.id === opts.excludeRequestId) continue;
    let parsedList: any[] = [];
    if (r.schedules_json) {
      try {
        const arr = JSON.parse(r.schedules_json);
        if (Array.isArray(arr)) parsedList = arr;
      } catch {}
    }

    if (parsedList.length > 0) {
      for (const item of parsedList) {
        const startIso = normalizeIsoWindow(item?.startIso || item?.startTime);
        const endIso = normalizeIsoWindow(item?.endIso || item?.endTime);
        if (!startIso || startIso.length < 16 || !endIso || endIso.length < 16) continue;
        if (dateFilter && !startIso.startsWith(dateFilter)) continue;
        out.push({
          requestId: r.id,
          serviceId: String(item?.serviceId || r.service_id || ''),
          professionalId: item?.professionalId ? String(item.professionalId) : (r.professional_id || null),
          classScheduleId: item?.classScheduleId ? String(item.classScheduleId) : (r.class_schedule_id || null),
          startIso,
          endIso
        });
      }
      continue;
    }

    const startIso = normalizeIsoWindow(r.start_time);
    const endIso = normalizeIsoWindow(r.end_time);
    if (startIso.length >= 16 && endIso.length >= 16) {
      if (!dateFilter || startIso.startsWith(dateFilter)) {
        out.push({
          requestId: r.id,
          serviceId: String(r.service_id || ''),
          professionalId: r.professional_id || null,
          classScheduleId: r.class_schedule_id || null,
          startIso,
          endIso
        });
      }
    }
  }

  return out;
}

function toMinuteOfDay(iso: string): number {
  const hh = Number(iso.slice(11, 13)) || 0;
  const mm = Number(iso.slice(14, 16)) || 0;
  return hh * 60 + mm;
}

/**
 * Conta quantas reservas temporárias ativas ocupam o mesmo grupo/vaga ou conflitam na agenda do profissional.
 */
export function countPendingHoldsForSlot(params: {
  holds: PublicSlotHoldEntry[];
  serviceId: string;
  professionalId?: string | null;
  startIso: string;
  endIso: string;
  isSharedGroup: boolean;
  classScheduleId?: string | null;
}): { sameSlotGroupHolds: number; conflictingProfessionalHolds: number } {
  const targetStart = normalizeIsoWindow(params.startIso);
  const targetEnd = normalizeIsoWindow(params.endIso);
  const targetDate = targetStart.slice(0, 10);
  const targetStartMin = toMinuteOfDay(targetStart);
  const targetEndMin = toMinuteOfDay(targetEnd);

  let sameSlotGroupHolds = 0;
  let conflictingProfessionalHolds = 0;

  for (const h of params.holds) {
    if (!h.startIso.startsWith(targetDate)) continue;
    const hStartMin = toMinuteOfDay(h.startIso);
    const hEndMin = toMinuteOfDay(h.endIso);
    const overlaps = targetStartMin < hEndMin && targetEndMin > hStartMin;
    if (!overlaps) continue;

    if (
      params.isSharedGroup &&
      h.serviceId === params.serviceId &&
      h.startIso.slice(0, 16) === targetStart.slice(0, 16) &&
      (!params.classScheduleId || !h.classScheduleId || h.classScheduleId === params.classScheduleId)
    ) {
      sameSlotGroupHolds += 1;
      continue;
    }

    if (params.professionalId && h.professionalId === params.professionalId) {
      conflictingProfessionalHolds += 1;
    }
  }

  return { sameSlotGroupHolds, conflictingProfessionalHolds };
}
