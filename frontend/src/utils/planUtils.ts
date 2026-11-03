/**
 * Utilitários para normalização e sanitização de planos.
 * Garante que eventos do React (ex: SyntheticEvent ao passar onClick={onRegisterClinic})
 * ou valores corrompidos nunca sejam tratados como código de plano ('[object Object]').
 */

export const VALID_PLAN_CODES = ['SOLO', 'DUO', 'EQUIPE', 'CLINICA', 'ENTERPRISE', 'CUSTOM'] as const;
export type ValidPlanCode = typeof VALID_PLAN_CODES[number];

/**
 * Normaliza e valida um código de plano.
 * Retorna uma string em maiúsculas (ex: 'SOLO') se válido, ou undefined se inválido.
 */
export function sanitizePlanCode(plan: unknown): string | undefined {
  if (typeof plan !== 'string') return undefined;
  const trimmed = plan.trim();
  if (!trimmed) return undefined;

  // Rejeita serializações acidentais de objetos ou eventos
  if (
    trimmed === '[object Object]' ||
    trimmed.toLowerCase().includes('[object') ||
    trimmed.toLowerCase() === 'undefined' ||
    trimmed.toLowerCase() === 'null'
  ) {
    return undefined;
  }

  // Normaliza prefixos conhecidos (ex: 'zemda-solo' ou 'plan-solo' -> 'SOLO')
  const upper = trimmed.toUpperCase().replace(/^(ZEMDA-|PLAN-)/, '');
  if ((VALID_PLAN_CODES as readonly string[]).includes(upper)) {
    return upper;
  }

  // Aceita identificadores alfanuméricos válidos de até 30 caracteres
  if (/^[A-Z0-9_-]{2,30}$/.test(upper)) {
    return upper;
  }

  return undefined;
}
