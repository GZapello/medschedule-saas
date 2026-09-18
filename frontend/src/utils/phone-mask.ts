export const VALID_BRAZILIAN_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24',
  '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46',
  '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '64', '63', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99'
]);

/**
 * Aplica máscara de telefone brasileiro em tempo real:
 * - 10 dígitos: (XX) XXXX-XXXX
 * - 11 dígitos: (XX) XXXXX-XXXX
 */
export function maskBrazilianPhone(value: string): string {
  if (!value) return '';
  // Se começar com +55, remove o prefixo internacional para mascarar formato local
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Validação de telefone brasileiro:
 * - DDD válido no Brasil
 * - 10 dígitos (fixo) ou 11 dígitos (celular com 9)
 * - Não permite números com todos os dígitos iguais
 */
export function validateBrazilianPhone(value: string): { valid: boolean; error?: string } {
  if (!value) return { valid: false, error: 'Telefone é obrigatório' };
  
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  if (digits.length < 10) {
    return { valid: false, error: 'Telefone incompleto. Informe DDD + número.' };
  }
  if (digits.length > 11) {
    return { valid: false, error: 'Telefone possui dígitos em excesso.' };
  }

  const ddd = digits.slice(0, 2);
  if (!VALID_BRAZILIAN_DDDS.has(ddd)) {
    return { valid: false, error: `DDD "${ddd}" não é um DDD brasileiro válido.` };
  }

  if (/^(\d)\1+$/.test(digits)) {
    return { valid: false, error: 'Número de telefone inválido (dígitos repetidos).' };
  }

  if (digits.length === 11) {
    const ninthDigit = digits[2];
    if (ninthDigit !== '9') {
      return { valid: false, error: 'Celulares com 11 dígitos devem iniciar com o dígito 9 após o DDD.' };
    }
  }

  return { valid: true };
}
