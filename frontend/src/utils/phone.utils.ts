/**
 * Utilitários para validação, normalização e formatação de telefones e mensagens de WhatsApp (Frontend)
 */

export function cleanPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

export function isValidPhoneNumber(phone: string | null | undefined): boolean {
  let digits = cleanPhoneDigits(phone);
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }
  // Padrão brasileiro: 10 dígitos (fixo com DDD) ou 11 dígitos (celular com DDD).
  // Se contiver DDI 55: 12 ou 13 dígitos. Padrão E.164 aceita até 15 dígitos.
  if (digits.length < 10 || digits.length > 15) {
    return false;
  }
  if (/^(\d)\1+$/.test(digits)) {
    return false;
  }
  const withoutDdi = digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  const ddd = parseInt(withoutDdi.slice(0, 2), 10);
  if (isNaN(ddd) || ddd < 11) {
    return false;
  }
  if (/^0+$/.test(withoutDdi.slice(2))) {
    return false;
  }
  return true;
}

export function normalizePhoneWithDDI(phone: string | null | undefined): string {
  let digits = cleanPhoneDigits(phone);
  if (!digits) return '';
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

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
  professionalName?: string;
  clinicName?: string;
  startTime: string;
  serviceName?: string;
  isTodayOverride?: boolean;
}): string {
  const { patientName, professionalName, clinicName, startTime, serviceName, isTodayOverride } = params;

  const rawStart = String(startTime || '').trim().replace(' ', 'T');
  const isToday = isTodayOverride !== undefined ? isTodayOverride : isDateToday(rawStart);

  const timeFormatted = rawStart.includes('T')
    ? rawStart.split('T')[1].slice(0, 5)
    : '00:00';

  let dateFormatted = '';
  if (!isToday && rawStart) {
    const datePart = rawStart.includes('T') ? rawStart.split('T')[0] : rawStart.slice(0, 10);
    const parts = datePart.split('-');
    if (parts.length === 3) {
      dateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else {
      dateFormatted = datePart;
    }
  }

  const cleanPatientName = (patientName || 'Cliente').trim();
  const cleanProfName = (professionalName || '').trim();
  const cleanClinicName = (clinicName || 'Clínica').trim();

  let serviceLine = '';
  if (serviceName && serviceName.trim()) {
    const sName = serviceName.trim();
    serviceLine = `\nConsulta: ${sName}`;
  }

  const profPart = cleanProfName ? `, com ${cleanProfName}` : '';

  if (isToday) {
    return (
      `Olá, ${cleanPatientName}! 😊\n\n` +
      `Passando para lembrar da sua consulta marcada para hoje, às ${timeFormatted}${profPart}.${serviceLine}\n\n` +
      `Se precisar remarcar ou cancelar, entre em contato conosco.\n\n` +
      `— ${cleanClinicName}`
    );
  }

  return (
    `Olá, ${cleanPatientName}! 😊\n\n` +
    `Passando para lembrar da sua consulta no dia ${dateFormatted}, às ${timeFormatted}${profPart}.${serviceLine}\n\n` +
    `Se precisar remarcar ou cancelar, entre em contato conosco.\n\n` +
    `— ${cleanClinicName}`
  );
}

export function generateWhatsAppUrl(phone: string, message: string): string {
  const normalizedPhone = normalizePhoneWithDDI(phone);
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

export interface OpenManualWhatsAppAppointment {
  patient_name?: string;
  patientName?: string;
  patient_phone?: string | null;
  patientPhone?: string | null;
  patient_whatsapp?: string | null;
  start_time?: string;
  startTime?: string;
  professional_name?: string;
  professionalName?: string;
  service_name?: string;
  serviceName?: string;
}

export interface OpenManualWhatsAppParams {
  appointment: OpenManualWhatsAppAppointment;
  clinicName?: string;
  onError: (message: string) => void;
}

/**
 * Abre a conversa no WhatsApp Web ou App com a mensagem de lembrete preenchida.
 * Valida o telefone, normaliza com DDI (sem duplicar 55) e exibe mensagem orientando cadastro se ausente ou inválido.
 * Não depende de API externa e não confirma agendamento pelo clique.
 */
export function openManualWhatsApp({ appointment, clinicName = 'Clínica', onError }: OpenManualWhatsAppParams): boolean {
  const phone = appointment.patient_phone ?? appointment.patientPhone ?? appointment.patient_whatsapp ?? '';
  const cleanPhone = String(phone || '').trim();

  if (!cleanPhone) {
    onError('Paciente sem telefone cadastrado. Por favor, atualize o cadastro para incluir o número com DDD.');
    return false;
  }

  const digits = cleanPhoneDigits(cleanPhone);
  if (!isValidPhoneNumber(cleanPhone) || digits.length < 10) {
    onError('O telefone cadastrado é inválido ou está sem o DDD. Por favor, atualize o cadastro do paciente para incluir o DDD.');
    return false;
  }

  const patientName = appointment.patient_name || appointment.patientName || 'Paciente';
  const professionalName = appointment.professional_name || appointment.professionalName || '';
  const serviceName = appointment.service_name || appointment.serviceName || '';
  const startTime = appointment.start_time || appointment.startTime || '';

  const message = buildWhatsAppReminderMessage({
    patientName,
    professionalName,
    clinicName,
    startTime,
    serviceName
  });

  const url = generateWhatsAppUrl(cleanPhone, message);
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return true;
}

/**
 * Gera mensagem padronizada para solicitação manual de assinatura de termo/consentimento.
 */
export function buildConsentWhatsAppMessage(params: {
  patientName: string;
  clinicName: string;
  linkUrl: string;
  isGuardian?: boolean;
  guardianName?: string;
}): string {
  const cleanPatient = (params.patientName || 'Paciente').trim();
  const cleanClinic = (params.clinicName || 'Clínica').trim();
  const cleanGuardian = (params.guardianName || 'Responsável').trim();
  const link = (params.linkUrl || '').trim();

  if (params.isGuardian) {
    return (
      `Olá, ${cleanGuardian}! 😊\n\n` +
      `A ${cleanClinic} disponibilizou um termo/consentimento referente a ${cleanPatient} para sua leitura e assinatura.\n\n` +
      `Acesse o link seguro:\n` +
      `${link}\n\n` +
      `— ${cleanClinic}`
    );
  }

  return (
    `Olá, ${cleanPatient}! 😊\n\n` +
    `A ${cleanClinic} disponibilizou um termo/consentimento para sua leitura e assinatura.\n\n` +
    `Acesse o link seguro abaixo:\n` +
    `${link}\n\n` +
    `O link é individual e deve ser utilizado somente pelo destinatário.\n\n` +
    `— ${cleanClinic}`
  );
}

/**
 * Gera mensagem padronizada para contato manual de lembrete de retorno/serviço.
 */
export function buildServiceReminderWhatsAppMessage(params: {
  patientName: string;
  serviceName: string;
  clinicName: string;
}): string {
  const cleanPatient = (params.patientName || 'Cliente').trim();
  const cleanService = (params.serviceName || 'serviço').trim();
  const cleanClinic = (params.clinicName || 'Clínica').trim();

  return (
    `Olá, ${cleanPatient}! 😊\n\n` +
    `Estamos entrando em contato porque chegou o período recomendado para acompanhamento/retorno referente ao serviço ${cleanService}.\n\n` +
    `Se desejar, podemos organizar seu próximo atendimento.\n\n` +
    `— ${cleanClinic}`
  );
}
