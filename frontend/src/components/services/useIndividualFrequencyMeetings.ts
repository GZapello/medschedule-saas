import { useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';
import { WeeklyMeeting } from '../../utils/studioFrequencyPricing';

export function useIndividualFrequencyMeetings(enabled: boolean, input: {
  professionalIds: string[]; durationMinutes: number; bufferMinutes: number; modality: string; allowedWeekdays?: number[];
}) {
  const [meetings, setMeetings] = useState<WeeklyMeeting[]>([]);
  const key = JSON.stringify(input);
  useEffect(() => {
    let cancelled = false;
    setMeetings([]);
    if (!enabled || !input.professionalIds.some(Boolean)) return;
    const timer = window.setTimeout(() => {
      ApiClient.post<{ meetings: WeeklyMeeting[] }>('/v1/services/frequency-meetings', { ...JSON.parse(key), serviceDomain: 'studio' })
        .then(data => { if (!cancelled) setMeetings(Array.isArray(data.meetings) ? data.meetings : []); })
        .catch(() => { if (!cancelled) setMeetings([]); });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [enabled, key]);
  return meetings;
}
