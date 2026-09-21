/**
 * Utilitários para validação, normalização e formatação de telefones e mensagens de WhatsApp (Frontend)
 */

export function cleanPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

export function isValidPhoneNumber(phone: string | null | undefined): boolean {
  const digits = cleanPhoneDigits(phone);
  // Padrão brasileiro: 10 dígitos (fixo com DDD) ou 11 dígitos (celular com DDD).
  // Se contiver DDI 55: 12 ou 13 dígitos. Padrão E.164 aceita até 15 dígitos.
  if (digits.length < 10 || digits.length > 15) {
    return false;
  }
  return true;
}

export function normalizePhoneWithDDI(phone: string | null | undefined): string {
  const digits = cleanPhoneDigits(phone);
  if (!digits) return '';

  // Se já começar com 55 e tiver 12 ou 13 dígitos, não duplicar
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // Se tiver 10 ou 11 dígitos (DDD + número brasileiro sem DDI), adiciona 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  // Se for maior que 11 e já começar com 55
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }

  // Se for número internacional com código já incluso (>= 11 dígitos)
  if (digits.length >= 11) {
    return digits;
  }

  return `55${digits}`;
}

export function formatPhoneDisplay(phone: string | null | undefined): string {
  const digits = cleanPhoneDigits(phone);
  if (!digits) return '';

  let d = digits;
  // Se vier com DDI 55 e tiver 12 ou 13 dígitos, remove o 55 para formatar padrão BR amigável
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

export function isDateToday(startTime: string): boolean {
  if (!startTime) return false;
  const datePart = startTime.includes('T') ? startTime.split('T')[0] : startTime.slice(0, 10);
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const localToday = `${year}-${month}-${day}`;

  return datePart === localToday;
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
