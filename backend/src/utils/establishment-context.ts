import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';

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

export function getTenantEstablishmentProfile(tenantId: string): EstablishmentProfile {
  if (!tenantId) return 'clinic';
  const row = db
    .prepare(`SELECT COALESCE(establishment_profile, 'clinic') as establishment_profile FROM tenants WHERE id = ?`)
    .get(tenantId) as { establishment_profile?: string } | undefined;
  return normalizeEstablishmentProfile(row?.establishment_profile);
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

/**
 * Resolve o domínio efetivo de um serviço ('clinical' | 'studio') sem usar heurísticas frágeis por texto.
 */
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

/**
 * Resolve o domínio de execução de um agendamento ('clinical' | 'studio').
 * Usado para decidir entre atendimento clínico tradicional vs ZemdaPersonal / Studio.
 */
export function resolveAppointmentWorkflowDomain(params: {
  establishmentProfile?: unknown;
  serviceDomain?: unknown;
  serviceKind?: unknown;
  appointmentServiceKind?: unknown;
  occurrenceId?: unknown;
  appointmentClinicalModule?: unknown;
  serviceClinicalModule?: unknown;
}): ServiceDomain {
  const profile = normalizeEstablishmentProfile(params.establishmentProfile);
  if (profile === 'clinic') return 'clinical';
  if (profile === 'studio') return 'studio';

  // Estabelecimento misto: respeita turma coletiva, domínio explícito do serviço e módulo ZemdaPersonal
  if (
    String(params.appointmentServiceKind || '').trim().toLowerCase() === 'group' ||
    String(params.serviceKind || '').trim().toLowerCase() === 'group' ||
    Boolean(params.occurrenceId)
  ) {
    return 'studio';
  }

  const explicit = String(params.serviceDomain || '').trim().toLowerCase();
  if (explicit === 'studio' || explicit === 'clinical') {
    return explicit as ServiceDomain;
  }

  const apptMod = String(params.appointmentClinicalModule || '').trim();
  const srvMod = String(params.serviceClinicalModule || '').trim();
  if (apptMod === 'ZemdaPersonal' || srvMod === 'ZemdaPersonal') {
    return 'studio';
  }

  return 'clinical';
}

export function shouldUseStudioPersonalWorkflow(params: {
  establishmentProfile?: unknown;
  serviceDomain?: unknown;
  serviceKind?: unknown;
  appointmentServiceKind?: unknown;
  occurrenceId?: unknown;
  appointmentClinicalModule?: unknown;
  serviceClinicalModule?: unknown;
}): boolean {
  return resolveAppointmentWorkflowDomain(params) === 'studio';
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

export function parseServiceRecurrenceConfig(serviceRow: any): ParsedServiceRecurrenceConfig {
  const allowFlag = Number(serviceRow?.allow_recurrence ?? 1) !== 0;
  const rawJson = serviceRow?.allowed_recurrence_frequencies_json;
  const rawDefault = String(serviceRow?.default_recurrence_frequency || '').trim();

  if (!allowFlag) {
    return {
      allowRecurrence: false,
      allowedFrequencies: [],
      defaultFrequency: null,
      hasExplicitConfig: true
    };
  }

  if (typeof rawJson === 'string' && rawJson.trim() !== '') {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        const filtered = Array.from(
          new Set(parsed.map(v => String(v).trim()).filter(isValidRecurrenceFrequency))
        );
        if (filtered.length === 0) {
          return {
            allowRecurrence: false,
            allowedFrequencies: [],
            defaultFrequency: null,
            hasExplicitConfig: true
          };
        }
        const defaultFrequency = isValidRecurrenceFrequency(rawDefault) && filtered.includes(rawDefault)
          ? rawDefault
          : filtered[0];
        return {
          allowRecurrence: true,
          allowedFrequencies: filtered,
          defaultFrequency,
          hasExplicitConfig: true
        };
      }
    } catch {
      // Fall back to legacy behavior when JSON is malformed
    }
  }

  const fallbackDefault = isValidRecurrenceFrequency(rawDefault) ? rawDefault : 'weekly';
  return {
    allowRecurrence: true,
    allowedFrequencies: [...ALL_RECURRENCE_FREQUENCIES],
    defaultFrequency: fallbackDefault,
    hasExplicitConfig: false
  };
}

export function validateServiceRecurrenceFrequency(
  serviceRow: any,
  requestedFrequency: unknown
): { valid: true; frequency: RecurrenceFrequency; config: ParsedServiceRecurrenceConfig } | {
  valid: false;
  code: string;
  error: string;
  config: ParsedServiceRecurrenceConfig;
} {
  const config = parseServiceRecurrenceConfig(serviceRow);
  if (!config.allowRecurrence || config.allowedFrequencies.length === 0) {
    return {
      valid: false,
      code: 'RECURRENCE_NOT_ALLOWED',
      error: `O serviço "${serviceRow?.name || 'selecionado'}" está configurado sem recorrência.`,
      config
    };
  }

  const reqFreq = String(requestedFrequency || '').trim();
  if (!reqFreq) {
    const resolved = config.defaultFrequency || config.allowedFrequencies[0];
    return { valid: true, frequency: resolved, config };
  }

  if (!isValidRecurrenceFrequency(reqFreq)) {
    return {
      valid: false,
      code: 'INVALID_RECURRENCE_FREQUENCY',
      error: 'Frequência de recorrência inválida.',
      config
    };
  }

  if (!config.allowedFrequencies.includes(reqFreq)) {
    const allowedLabels = config.allowedFrequencies.map(f => RECURRENCE_FREQUENCY_LABELS[f]).join(', ');
    return {
      valid: false,
      code: 'RECURRENCE_FREQUENCY_NOT_ALLOWED',
      error: `A frequência "${RECURRENCE_FREQUENCY_LABELS[reqFreq]}" não é permitida para "${serviceRow?.name || 'este serviço'}". Permitidas: ${allowedLabels}.`,
      config
    };
  }

  return { valid: true, frequency: reqFreq, config };
}

export function normalizeRecurrenceConfigForSave(input: {
  allowRecurrence?: unknown;
  allowedRecurrenceFrequencies?: unknown;
  defaultRecurrenceFrequency?: unknown;
}): {
  allowRecurrenceInt: 0 | 1;
  allowedJson: string | null;
  defaultFrequency: RecurrenceFrequency | null;
  error?: string;
} {
  const rawAllowed = input.allowedRecurrenceFrequencies;
  const hasExplicitArray = Array.isArray(rawAllowed);

  if (input.allowRecurrence === false || input.allowRecurrence === 0 || input.allowRecurrence === '0') {
    return {
      allowRecurrenceInt: 0,
      allowedJson: hasExplicitArray ? '[]' : null,
      defaultFrequency: null
    };
  }

  if (hasExplicitArray) {
    const rawList = rawAllowed as unknown[];
    const invalid = rawList.filter(v => !isValidRecurrenceFrequency(v));
    if (invalid.length > 0) {
      return {
        allowRecurrenceInt: 1,
        allowedJson: null,
        defaultFrequency: null,
        error: 'Uma ou mais frequências de recorrência informadas são inválidas.'
      };
    }

    const deduped = Array.from(new Set(rawList.map(v => String(v).trim()).filter(isValidRecurrenceFrequency)));
    if (deduped.length === 0) {
      return {
        allowRecurrenceInt: 0,
        allowedJson: '[]',
        defaultFrequency: null
      };
    }

    const rawDefault = input.defaultRecurrenceFrequency !== undefined && input.defaultRecurrenceFrequency !== null
      ? String(input.defaultRecurrenceFrequency).trim()
      : '';

    if (rawDefault && !deduped.includes(rawDefault as RecurrenceFrequency)) {
      return {
        allowRecurrenceInt: 1,
        allowedJson: null,
        defaultFrequency: null,
        error: 'A frequência padrão precisa estar entre as frequências permitidas do serviço.'
      };
    }

    const defaultFrequency: RecurrenceFrequency = (rawDefault && isValidRecurrenceFrequency(rawDefault))
      ? rawDefault
      : deduped[0];

    return {
      allowRecurrenceInt: 1,
      allowedJson: JSON.stringify(deduped),
      defaultFrequency
    };
  }

  const rawDefault = input.defaultRecurrenceFrequency !== undefined && input.defaultRecurrenceFrequency !== null
    ? String(input.defaultRecurrenceFrequency).trim()
    : '';
  if (rawDefault && !isValidRecurrenceFrequency(rawDefault)) {
    return {
      allowRecurrenceInt: 1,
      allowedJson: null,
      defaultFrequency: null,
      error: 'Frequência padrão de recorrência inválida.'
    };
  }

  return {
    allowRecurrenceInt: 1,
    allowedJson: null,
    defaultFrequency: rawDefault && isValidRecurrenceFrequency(rawDefault) ? rawDefault : null
  };
}

export function requireStudioEstablishment(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Estabelecimento não identificado.' });
    return;
  }
  const profile = getTenantEstablishmentProfile(tenantId);
  if (!supportsStudioFeatures(profile)) {
    res.status(403).json({
      code: 'STUDIO_PROFILE_REQUIRED',
      error: 'Esta funcionalidade está disponível apenas para estabelecimentos configurados como Studio / Academia ou Estabelecimento Misto.'
    });
    return;
  }
  next();
}
