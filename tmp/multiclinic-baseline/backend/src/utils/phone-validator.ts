/**
 * Validador e formatador de telefones brasileiros para o Zemda
 * Valida os 67 DDDs oficiais do Brasil e a quantidade de dígitos (10 para fixo, 11 para celular).
 */

// Lista oficial dos 67 DDDs brasileiros válidos
export const VALID_BRAZILIAN_DDDS = new Set([
  // SP
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  // RJ e ES
  '21', '22', '24', '27', '28',
  // MG
  '31', '32', '33', '34', '35', '37', '38',
  // PR e SC
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  // RS
  '51', '53', '54', '55',
  // DF, GO, TO, MT, MS, AC, RO
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  // BA e SE
  '71', '73', '74', '75', '77', '79',
  // PE, AL, PB, RN, PI, CE
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  // PA, AP, AM, RR, MA
  '91', '92', '93', '94', '95', '96', '97', '98', '99'
]);

export interface PhoneValidationResult {
  isValid: boolean;
  cleanDigits: string;
  formatted?: string;
  error?: string;
}

/**
 * Remove formatação e caracteres não numéricos
 */
export function sanitizePhoneDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Valida e formata telefone brasileiro
 * Regras:
 * - 10 dígitos: (DD) [2-8]XXXX-XXXX (Telefone fixo)
 * - 11 dígitos: (DD) 9XXXX-XXXX (Celular móvel)
 */
export function validateAndFormatBrazilianPhone(phone: string | null | undefined, isRequired = true): PhoneValidationResult {
  const digits = sanitizePhoneDigits(phone);

  if (!digits) {
    if (!isRequired) {
      return { isValid: true, cleanDigits: '' };
    }
    return { isValid: false, cleanDigits: '', error: 'Telefone é obrigatório' };
  }

  // Comprimento obrigatório: 10 ou 11 dígitos
  if (digits.length !== 10 && digits.length !== 11) {
    return {
      isValid: false,
      cleanDigits: digits,
      error: `Quantidade de dígitos inválida (${digits.length}). Telefone fixo requer 10 dígitos e celular requer 11 dígitos.`
    };
  }

  // DDD
  const ddd = digits.slice(0, 2);
  if (!VALID_BRAZILIAN_DDDS.has(ddd)) {
    return {
      isValid: false,
      cleanDigits: digits,
      error: `DDD ${ddd} não é um DDD brasileiro válido.`
    };
  }

  // Não permitir dígitos todos iguais (ex: 11111111111, 0000000000)
  if (/^(\d)\1+$/.test(digits)) {
    return {
      isValid: false,
      cleanDigits: digits,
      error: 'Telefone inválido: sequência de números repetidos.'
    };
  }

  const numberPart = digits.slice(2);

  // Celular (11 dígitos): terceiro dígito obrigatoriamente 9
  if (digits.length === 11) {
    if (numberPart[0] !== '9') {
      return {
        isValid: false,
        cleanDigits: digits,
        error: 'Número de celular brasileiro deve iniciar com o dígito 9 após o DDD.'
      };
    }
    const formatted = `(${ddd}) ${numberPart.slice(0, 5)}-${numberPart.slice(5)}`;
    return { isValid: true, cleanDigits: digits, formatted };
  }

  // Fixo (10 dígitos): primeiro dígito do número entre 2 e 8
  if (!['2', '3', '4', '5', '6', '7', '8'].includes(numberPart[0])) {
    return {
      isValid: false,
      cleanDigits: digits,
      error: 'Telefone fixo brasileiro deve iniciar com dígito de 2 a 8 após o DDD.'
    };
  }

  const formatted = `(${ddd}) ${numberPart.slice(0, 4)}-${numberPart.slice(4)}`;
  return { isValid: true, cleanDigits: digits, formatted };
}

export function isValidBrazilianPhone(phone: string | null | undefined, isRequired = true): boolean {
  return validateAndFormatBrazilianPhone(phone, isRequired).isValid;
}

export function formatBrazilianPhone(phone: string | null | undefined): string {
  const res = validateAndFormatBrazilianPhone(phone, false);
  return res.formatted || sanitizePhoneDigits(phone);
}
