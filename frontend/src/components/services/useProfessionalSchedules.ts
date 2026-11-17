import { useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';

export interface ProfessionalScheduleRow {
  id?: string;
  professionalId: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  break_start?: string | null;
  break_end?: string | null;
  is_active: boolean | number;
}

export function useProfessionalSchedules(enabled: boolean, professionalIds: string[]) {
  const uniqueIds = Array.from(new Set(professionalIds.map(id => String(id || '').trim()).filter(Boolean))).sort();
  const key = uniqueIds.join(',');
  const [schedules, setSchedules] = useState<ProfessionalScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || uniqueIds.length === 0) {
      setSchedules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      uniqueIds.map(async profId => {
        try {
          const res = await ApiClient.get<{ schedules?: any[] }>(`/v1/professionals/${profId}`);
          const rows = Array.isArray(res?.schedules) ? res.schedules : [];
          return rows.map(r => ({
            id: r.id,
            professionalId: profId,
            day_of_week: Number(r.day_of_week),
            start_time: String(r.start_time || '').slice(0, 5),
            end_time: String(r.end_time || '').slice(0, 5),
            break_start: r.break_start ? String(r.break_start).slice(0, 5) : null,
            break_end: r.break_end ? String(r.break_end).slice(0, 5) : null,
            is_active: r.is_active === true || Number(r.is_active) === 1
          })) as ProfessionalScheduleRow[];
        } catch {
          return [] as ProfessionalScheduleRow[];
        }
      })
    )
      .then(chunks => {
        if (!cancelled) {
          setSchedules(chunks.flat());
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSchedules([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  return { schedules, loading };
}
