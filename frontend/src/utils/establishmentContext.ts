export type EstablishmentProfile = 'clinic' | 'studio' | 'mixed';
export type ServiceDomain = 'clinical' | 'studio';
export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom_weekdays';

export const ALL_RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = [
  'weekly',
  'biweekly',
  'monthly',
  'custom_weekdays'
];

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  custom_weekdays: 'Dias específicos da semana'
};

export function normalizeEstablishmentProfile(raw?: unknown): EstablishmentProfile {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'studio' || val === 'mixed') return val;
  return 'clinic';
}

export function isClinicProfile(profile?: unknown): boolean {
  return normalizeEstablishmentProfile(profile) === 'clinic';
}

export function isStudioProfile(profile?: unknown): boolean {
  return normalizeEstablishmentProfile(profile) === 'studio';
}

export function isMixedProfile(profile?: unknown): boolean {
  return normalizeEstablishmentProfile(profile) === 'mixed';
}

export function supportsStudioFeatures(profile?: unknown): boolean {
  const p = normalizeEstablishmentProfile(profile);
  return p === 'studio' || p === 'mixed';
}

export function supportsClinicalFeatures(profile?: unknown): boolean {
  const p = normalizeEstablishmentProfile(profile);
  return p === 'clinic' || p === 'mixed';
}

export function resolveServiceDomain(params: {
  establishmentProfile?: unknown;
  serviceDomain?: unknown;
  serviceKind?: unknown;
  clinicalModule?: unknown;
}): ServiceDomain {
  const profile = normalizeEstablishmentProfile(params.establishmentProfile);
  if (profile === 'clinic') return 'clinical';
  if (profile === 'studio') return 'studio';

  const explicit = String(params.serviceDomain || '').trim().toLowerCase();
  if (explicit === 'studio' || explicit === 'clinical') {
    return explicit as ServiceDomain;
  }
  if (String(params.serviceKind || '').trim().toLowerCase() === 'group') {
    return 'studio';
  }
  if (String(params.clinicalModule || '').trim() === 'ZemdaPersonal') {
    return 'studio';
  }
  return 'clinical';
}

export function shouldRedirectAppointmentToZemdaPersonal(params: {
  establishmentProfile?: unknown;
  serviceDomain?: unknown;
  serviceKind?: unknown;
  occurrenceId?: unknown;
  appointmentClinicalModule?: unknown;
  serviceClinicalModule?: unknown;
}): boolean {
  const profile = normalizeEstablishmentProfile(params.establishmentProfile);
  if (profile === 'clinic') return false;
  if (profile === 'studio') return true;

  if (String(params.serviceKind || '').trim().toLowerCase() === 'group' || Boolean(params.occurrenceId)) {
    return true;
  }
  const explicit = String(params.serviceDomain || '').trim().toLowerCase();
  if (explicit === 'studio') return true;
  if (explicit === 'clinical') return false;

  if (
    String(params.appointmentClinicalModule || '').trim() === 'ZemdaPersonal' ||
    String(params.serviceClinicalModule || '').trim() === 'ZemdaPersonal'
  ) {
    return true;
  }
  return false;
}

export interface ParsedServiceRecurrenceConfig {
  allowRecurrence: boolean;
  allowedFrequencies: RecurrenceFrequency[];
  defaultFrequency: RecurrenceFrequency | null;
  hasExplicitConfig: boolean;
}

export function isValidRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return ALL_RECURRENCE_FREQUENCIES.includes(String(value || '').trim() as RecurrenceFrequency);
}

export function parseServiceRecurrenceConfig(service?: {
  allow_recurrence?: number | boolean | null;
  allowed_recurrence_frequencies?: string[] | null;
  allowed_recurrence_frequencies_json?: string | null;
  default_recurrence_frequency?: string | null;
} | null): ParsedServiceRecurrenceConfig {
  if (!service) {
    return {
      allowRecurrence: true,
      allowedFrequencies: [...ALL_RECURRENCE_FREQUENCIES],
      defaultFrequency: 'weekly',
      hasExplicitConfig: false
    };
  }

  const allowFlag = Number(service.allow_recurrence ?? 1) !== 0;
  if (!allowFlag) {
    return {
      allowRecurrence: false,
      allowedFrequencies: [],
      defaultFrequency: null,
      hasExplicitConfig: true
    };
  }

  let parsedList: RecurrenceFrequency[] | null = null;
  if (Array.isArray(service.allowed_recurrence_frequencies)) {
    parsedList = Array.from(
      new Set(service.allowed_recurrence_frequencies.filter(isValidRecurrenceFrequency))
    );
  } else if (typeof service.allowed_recurrence_frequencies_json === 'string' && service.allowed_recurrence_frequencies_json.trim()) {
    try {
      const raw = JSON.parse(service.allowed_recurrence_frequencies_json);
      if (Array.isArray(raw)) {
        parsedList = Array.from(
          new Set(raw.map(v => String(v).trim()).filter(isValidRecurrenceFrequency))
        );
      }
    } catch {
      parsedList = null;
    }
  }

  const rawDefault = String(service.default_recurrence_frequency || '').trim();
  if (parsedList !== null) {
    if (parsedList.length === 0) {
      return {
        allowRecurrence: false,
        allowedFrequencies: [],
        defaultFrequency: null,
        hasExplicitConfig: true
      };
    }
    const defaultFrequency = isValidRecurrenceFrequency(rawDefault) && parsedList.includes(rawDefault)
      ? rawDefault
      : parsedList[0];
    return {
      allowRecurrence: true,
      allowedFrequencies: parsedList,
      defaultFrequency,
      hasExplicitConfig: true
    };
  }

  return {
    allowRecurrence: true,
    allowedFrequencies: [...ALL_RECURRENCE_FREQUENCIES],
    defaultFrequency: isValidRecurrenceFrequency(rawDefault) ? rawDefault : 'weekly',
    hasExplicitConfig: false
  };
}

export function isSidebarItemAllowedForProfile(itemId: string, profileRaw?: unknown): boolean {
  const profile = normalizeEstablishmentProfile(profileRaw);
  if (profile === 'studio') {
    const clinicOnlyItems = new Set([
      'clinical',
      'clinical-records',
      'pending-exams',
      'zemda-med',
      'zemda-odonto',
      'zemda-fisio',
      'zemda-nutri',
      'zemda-psico',
      'zemda-fono',
      'zemda-to',
      'zemda-pp',
      'zemda-estetic',
      'zemda-body',
      'zemda360'
    ]);
    return !clinicOnlyItems.has(itemId);
  }
  return true;
}

export interface ActiveStudioSession {
  appointmentId: string;
  patientId: string;
  patientName?: string;
  serviceId?: string | null;
  serviceName?: string | null;
  serviceKind?: string | null;
  serviceDomain?: string | null;
  occurrenceId?: string | null;
  startTime?: string | null;
  tenantId?: string | null;
}

export const STUDIO_SESSION_STORAGE_KEY = 'zemda_active_studio_session';

export function buildActiveStudioSessionFromAppointment(appt: any, tenantId?: string | null): ActiveStudioSession {
  const serviceKind = String(appt?.service_kind || '').trim().toLowerCase() || (appt?.occurrence_id ? 'group' : 'individual');
  return {
    appointmentId: String(appt?.id || ''),
    patientId: String(appt?.patient_id || ''),
    patientName: appt?.patient_name ? String(appt.patient_name) : undefined,
    serviceId: appt?.service_id ? String(appt.service_id) : null,
    serviceName: appt?.service_name ? String(appt.service_name) : null,
    serviceKind,
    serviceDomain: appt?.service_domain ? String(appt.service_domain) : null,
    occurrenceId: appt?.occurrence_id ? String(appt.occurrence_id) : null,
    startTime: appt?.start_time ? String(appt.start_time) : null,
    tenantId: tenantId || (appt?.tenant_id ? String(appt.tenant_id) : null)
  };
}

export function readActiveStudioSession(): ActiveStudioSession | null {
  try {
    const raw = sessionStorage.getItem(STUDIO_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || (!parsed.appointmentId && !parsed.occurrenceId)) return null;
    return parsed as ActiveStudioSession;
  } catch {
    return null;
  }
}

export function writeActiveStudioSession(session: ActiveStudioSession | null): void {
  try {
    if (!session) {
      sessionStorage.removeItem(STUDIO_SESSION_STORAGE_KEY);
    } else {
      sessionStorage.setItem(STUDIO_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
    window.dispatchEvent(new CustomEvent('zemda-studio-session-changed', { detail: session }));
  } catch {
    // ignore storage errors
  }
}

export function clearActiveStudioSession(): void {
  writeActiveStudioSession(null);
}
