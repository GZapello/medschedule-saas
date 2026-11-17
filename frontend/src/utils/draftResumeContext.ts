export interface PendingDraftResumeIntent {
  patientId: string;
  resolvedModule: string;
  appointmentId?: string | null;
  draftSubtype?: 'assessment' | 'workout' | null;
  tenantId?: string | null;
  createdAt: number;
}

const DRAFT_RESUME_STORAGE_KEY = 'zemda_pending_draft_resume';

const MODULE_VIEW_MAP: Record<string, string> = {
  ZemdaPersonal: 'zemda-personal',
  ZemdaMed: 'zemda-med',
  ZemdaFisio: 'zemda-fisio',
  ZemdaOdonto: 'zemda-odonto',
  ZemdaEstetic: 'zemda-estetic',
  ZemdaNutri: 'zemda-nutri',
  ZemdaTO: 'zemda-to',
  ZemdaFono: 'zemda-fono',
  ZemdaPsico: 'zemda-psico',
  ZemdaPP: 'zemda-pp'
};

export function resolveWorkspaceViewForModule(resolvedModule?: string | null): string | null {
  if (!resolvedModule) return null;
  return MODULE_VIEW_MAP[resolvedModule] || null;
}

export function writePendingDraftResume(intent: Omit<PendingDraftResumeIntent, 'createdAt'> | null): void {
  try {
    if (!intent) {
      sessionStorage.removeItem(DRAFT_RESUME_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(
      DRAFT_RESUME_STORAGE_KEY,
      JSON.stringify({
        ...intent,
        createdAt: Date.now()
      })
    );
  } catch {
    // ignore storage errors
  }
}

export function consumePendingDraftResume(
  predicate: (intent: PendingDraftResumeIntent) => boolean
): PendingDraftResumeIntent | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingDraftResumeIntent;
    if (!parsed || Date.now() - Number(parsed.createdAt || 0) > 60000) {
      sessionStorage.removeItem(DRAFT_RESUME_STORAGE_KEY);
      return null;
    }
    if (!predicate(parsed)) return null;
    sessionStorage.removeItem(DRAFT_RESUME_STORAGE_KEY);
    return parsed;
  } catch {
    return null;
  }
}

export function formatWorklistDateTime(referenceAt?: string | null, fallbackRaw?: string | null): string {
  const source = referenceAt || fallbackRaw;
  if (!source) return 'Sem data';
  try {
    let iso = String(source).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      iso = `${iso}T12:00:00`;
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(iso) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) {
      iso = iso.replace(' ', 'T');
    }
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return String(source);
    const datePart = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo'
    }).format(dt);
    const timePart = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo'
    }).format(dt);
    return `${datePart} às ${timePart}`;
  } catch {
    return String(source);
  }
}
