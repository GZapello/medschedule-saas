// Only explicitly reviewed text may enter this transient handoff. Never store raw transcripts.
const reviewedEvolution = new Map<string, string>();
export function queueReviewedEvolution(id: string, text: string) {
  reviewedEvolution.set(id, [reviewedEvolution.get(id), text].filter(Boolean).join('\n\n'));
}
export function takeReviewedEvolution(id: string): string {
  const text = reviewedEvolution.get(id) || '';
  reviewedEvolution.delete(id);
  return text;
}

export function isMeetingUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

// Call only from explicit user actions, never from effects or rendering.
export function openTeleconsultation(appointment: { modality?: string; meeting_url?: string | null }): boolean {
  if (appointment.modality !== 'online' || !appointment.meeting_url || !isMeetingUrl(appointment.meeting_url)) return false;
  window.open(appointment.meeting_url.trim(), '_blank', 'noopener,noreferrer');
  return true;
}
