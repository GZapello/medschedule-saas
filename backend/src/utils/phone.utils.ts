/**
 * Utilitários para normalização de telefone e geração de mensagens WhatsApp (Zemda)
 */

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

export function cleanPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Validação rigorosa de telefone e DDD brasileiro:
 * - DDD válido no Brasil
 * - 10 dígitos (fixo) ou 11 dígitos (celular com 9)
 * - Não permite números com todos os dígitos repetidos
 */
export function validateBrazilianPhone(value: string | null | undefined): { valid: boolean; error?: string } {
  if (!value) return { valid: false, error: 'Telefone é obrigatório' };

  let digits = cleanPhoneDigits(value);
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  if (digits.length < 10) {
    return { valid: false, error: 'Telefone incompleto. Informe o DDD e o número completo.' };
  }
  if (digits.length > 11) {
    return { valid: false, error: 'Telefone possui dígitos em excesso para o padrão brasileiro.' };
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

export function isValidPhoneNumber(phone: string | null | undefined): boolean {
  const res = validateBrazilianPhone(phone);
  if (!res.valid) {
    // Permite números de 10 a 15 dígitos internacional caso aplicável
    const digits = cleanPhoneDigits(phone);
    return digits.length >= 10 && digits.length <= 15;
  }
  return true;
}

export function normalizePhoneWithDDI(phone: string | null | undefined): string {
  const digits = cleanPhoneDigits(phone);
  if (!digits) return '';

  // Se já começar com 55 e tiver 12 ou 13 dígitos (DDI 55 + DDD + número), não duplicar
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // Se tiver 10 ou 11 dígitos (DDD + número brasileiro sem DDI), adiciona 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  // Se for maior que 11 e já começar com 55, mantém
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }

  // Se for número internacional com código do país já incluso (>= 11 dígitos)
  if (digits.length >= 11) {
    return digits;
  }

  return `55${digits}`;
}

export function formatPhoneDisplay(phone: string | null | undefined): string {
  const digits = cleanPhoneDigits(phone);
  if (!digits) return '';

  let d = digits;
  // Se vier com DDI 55 e tiver 12 ou 13 dígitos, remove o 55 para formatar padrão BR
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  }

  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }

  return phone ? String(phone).trim() : digits;
}

export interface BuildReminderParams {
  patientName: string;
  professionalName: string;
  clinicName: string;
  startTime: string;
  serviceName?: string;
  isTodayOverride?: boolean;
}

export function isDateToday(startTime: string): boolean {
  if (!startTime) return false;
  const datePart = startTime.includes('T') ? startTime.split('T')[0] : startTime.slice(0, 10);
  
  // Data atual no fuso do Brasil
  const now = new Date();
  const brYear = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' });
  const brMonth = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', month: '2-digit' });
  const brDay = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', day: '2-digit' });
  const todayBrStr = `${brYear}-${brMonth}-${brDay}`;

  return datePart === todayBrStr;
}

export function buildWhatsAppReminderMessage(params: {
  patientName: string;
  professionalName: string;
  clinicName: string;
  startTime: string;
  serviceName?: string;
  isTodayOverride?: boolean;
}): string {
  const { patientName, professionalName, clinicName, startTime, serviceName, isTodayOverride } = params;

  const isToday = isTodayOverride !== undefined ? isTodayOverride : isDateToday(startTime);

  const timeFormatted = startTime.includes('T')
    ? startTime.split('T')[1].slice(0, 5)
    : '00:00';

  let dateFormatted = '';
  if (!isToday && startTime) {
    const datePart = startTime.includes('T') ? startTime.split('T')[0] : startTime.slice(0, 10);
    const parts = datePart.split('-');
    if (parts.length === 3) {
      dateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else {
      dateFormatted = datePart;
    }
  }

  const cleanPatientName = (patientName || 'Cliente').trim();
  const cleanProfName = (professionalName || 'Profissional').trim();
  const cleanClinicName = (clinicName || 'Clínica').trim();

  let serviceLine = '';
  if (serviceName && serviceName.trim()) {
    const sName = serviceName.trim();
    serviceLine = `\nConsulta: ${sName}`;
  }

  if (isToday) {
    return (
      `Olá, ${cleanPatientName}! 😊\n\n` +
      `Passando para lembrar da sua consulta marcada para hoje, às ${timeFormatted}, com ${cleanProfName}.${serviceLine}\n\n` +
      `Se precisar remarcar ou cancelar, entre em contato conosco.\n\n` +
      `— ${cleanClinicName}`
    );
  }

  return (
    `Olá, ${cleanPatientName}! 😊\n\n` +
    `Passando para lembrar da sua consulta no dia ${dateFormatted}, às ${timeFormatted}, com ${cleanProfName}.${serviceLine}\n\n` +
    `Se precisar remarcar ou cancelar, entre em contato conosco.\n\n` +
    `— ${cleanClinicName}`
  );
}

export function generateWhatsAppUrl(phone: string, message: string): string {
  const normalizedPhone = normalizePhoneWithDDI(phone);
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
