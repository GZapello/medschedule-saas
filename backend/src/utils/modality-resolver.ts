export type ConcreteModality = 'presential' | 'online' | 'home';
export type ServiceModality = ConcreteModality | 'both';

export const CONCRETE_MODALITIES: readonly ConcreteModality[] = ['presential', 'online', 'home'] as const;

export const MODALITY_VALIDATION_ERROR =
  'Não foi possível confirmar esta modalidade. Revise sua escolha e tente novamente.';

export function isConcreteModality(value: unknown): value is ConcreteModality {
  if (typeof value !== 'string') return false;
  const norm = value.trim().toLowerCase();
  return norm === 'presential' || norm === 'online' || norm === 'home';
}

export function normalizeServiceModality(value: unknown): ServiceModality {
  if (typeof value !== 'string') return 'both';
  const norm = value.trim().toLowerCase();
  if (norm === 'presential' || norm === 'online' || norm === 'home' || norm === 'both') {
    return norm;
  }
  return 'both';
}

export function getAllowedConcreteModalities(
  serviceModality: unknown,
  allowHome = true
): ConcreteModality[] {
  const mod = normalizeServiceModality(serviceModality);
  if (mod === 'presential') return ['presential'];
  if (mod === 'online') return ['online'];
  if (mod === 'home') return allowHome ? ['home'] : [];
  // 'both' em services significa Presencial ou Online (nunca Domiciliar)
  return ['presential', 'online'];
}

export interface ResolveConcreteModalityOptions {
  serviceModality?: unknown;
  requestedModality?: unknown;
  scheduleModality?: unknown;
  allowHome?: boolean;
}

/**
 * Resolve e valida uma modalidade concreta ('presential' | 'online' | 'home')
 * para persistência em class_series, class_occurrences e appointments.
 * Nunca retorna 'both'.
 */
export function resolveConcreteModality(options: ResolveConcreteModalityOptions): ConcreteModality {
  const allowHome = options.allowHome !== false;
  const allowedByService = getAllowedConcreteModalities(options.serviceModality, allowHome);

  if (allowedByService.length === 0) {
    throw Object.assign(new Error(MODALITY_VALIDATION_ERROR), {
      status: 400,
      code: 'INVALID_MODALITY'
    });
  }

  let fixedScheduleMod: ConcreteModality | null = null;
  if (
    options.scheduleModality !== undefined &&
    options.scheduleModality !== null &&
    String(options.scheduleModality).trim() !== ''
  ) {
    const rawSched = String(options.scheduleModality).trim().toLowerCase();
    if (!isConcreteModality(rawSched) || !allowedByService.includes(rawSched)) {
      throw Object.assign(new Error(MODALITY_VALIDATION_ERROR), {
        status: 400,
        code: 'INVALID_MODALITY'
      });
    }
    fixedScheduleMod = rawSched;
  }

  const hasRequested =
    options.requestedModality !== undefined &&
    options.requestedModality !== null &&
    String(options.requestedModality).trim() !== '';

  if (hasRequested) {
    const rawReq = String(options.requestedModality).trim().toLowerCase();
    if (!isConcreteModality(rawReq)) {
      throw Object.assign(new Error(MODALITY_VALIDATION_ERROR), {
        status: 400,
        code: 'INVALID_MODALITY'
      });
    }
    if (!allowedByService.includes(rawReq)) {
      throw Object.assign(new Error(MODALITY_VALIDATION_ERROR), {
        status: 400,
        code: 'INVALID_MODALITY'
      });
    }
    if (fixedScheduleMod && rawReq !== fixedScheduleMod) {
      throw Object.assign(
        new Error(
          fixedScheduleMod === 'online'
            ? 'Esta turma está configurada exclusivamente para atendimento online.'
            : fixedScheduleMod === 'home'
            ? 'Esta turma está configurada exclusivamente para atendimento domiciliar.'
            : 'Esta turma está configurada exclusivamente para atendimento presencial.'
        ),
        {
          status: 400,
          code: 'INVALID_MODALITY'
        }
      );
    }
    return rawReq;
  }

  if (fixedScheduleMod) {
    return fixedScheduleMod;
  }

  // Padrão para serviços flexíveis ('both') — prioriza 'presential'
  if (allowedByService.includes('presential')) {
    return 'presential';
  }
  return allowedByService[0];
}

export function sanitizeBookingErrorMessage(
  err: any,
  fallback = 'Não foi possível concluir a solicitação. Tente novamente.'
): string {
  const status = Number(err?.status || 0);
  const rawMsg = String(err?.error || err?.message || '').trim();
  const isSqlInternal =
    /SQLITE|CHECK constraint|FOREIGN KEY constraint|UNIQUE constraint|no such column|no such table|syntax error/i.test(
      rawMsg
    );
  if (isSqlInternal) {
    if (/modality/i.test(rawMsg)) {
      return MODALITY_VALIDATION_ERROR;
    }
    return fallback;
  }
  if (status >= 400 && status < 500 && rawMsg) {
    return rawMsg;
  }
  return fallback;
}
