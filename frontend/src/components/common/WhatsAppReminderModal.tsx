import React from 'react';
import {
  buildWhatsAppReminderMessage,
  isDateToday
} from '../../utils/phone.utils';
import {
  UniversalWhatsAppModal,
  WhatsAppContextItem,
  WhatsAppIcon
} from './UniversalWhatsAppModal';

export { WhatsAppIcon };

export interface WhatsAppReminderAppointment {
  id: string;
  patient_id?: string;
  patient_name: string;
  patient_phone?: string;
  start_time: string;
  professional_name: string;
  service_name?: string;
  appointment_number?: string;
  status?: string;
}

export interface WhatsAppReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: WhatsAppReminderAppointment | null;
  clinicName?: string;
  onSuccess?: () => void;
}

export const WhatsAppReminderModal: React.FC<WhatsAppReminderModalProps> = ({
  isOpen,
  onClose,
  appointment,
  clinicName = 'Clínica',
  onSuccess
}) => {
  if (!isOpen || !appointment) return null;

  const isToday = isDateToday(appointment.start_time);
  const timeStr = appointment.start_time.includes('T')
    ? appointment.start_time.split('T')[1].slice(0, 5)
    : '00:00';
  const dateStr = appointment.start_time.includes('T')
    ? appointment.start_time.split('T')[0]
    : appointment.start_time.slice(0, 10);
  const [y, m, d] = dateStr.split('-');
  const formattedDate = d && m && y ? `${d}/${m}/${y}` : dateStr;

  const defaultMessage = buildWhatsAppReminderMessage({
    patientName: appointment.patient_name,
    professionalName: appointment.professional_name,
    clinicName,
    startTime: appointment.start_time,
    serviceName: appointment.service_name
  });

  const contextItems: WhatsAppContextItem[] = [
    {
      label: 'Data & Horário',
      value: `${isToday ? 'Hoje' : formattedDate} às ${timeStr}`
    },
    {
      label: 'Profissional',
      value: appointment.professional_name
    },
    {
      label: 'Serviço',
      value: appointment.service_name || 'Consulta'
    }
  ];

  return (
    <UniversalWhatsAppModal
      isOpen={isOpen}
      onClose={onClose}
      title="Enviar Lembrete por WhatsApp"
      subtitle="Confirmação de dados antes do envio para evitar erros."
      recipientName={appointment.patient_name}
      phone={appointment.patient_phone}
      phoneErrorMessage="Telefone não cadastrado ou formato inválido."
      contextItems={contextItems}
      defaultMessage={defaultMessage}
      confirmButtonText="Abrir no WhatsApp"
      noticeText="A mensagem será aberta no WhatsApp com o contato e texto preenchidos. O envio será feito manualmente por você."
      onConfirmOpen={() => {
        if (onSuccess) onSuccess();
      }}
    />
  );
};
