import React, { useState } from 'react';
import { ApiClient } from '../../api/client';
import { ConsultationPaymentModal } from './ConsultationPaymentModal';

export function useConsultationCompletion(onFinished?: () => void) {
  const [receipt, setReceipt] = useState<any>(null);
  const save = async (endpoint: string, payload: any) => {
    let appointmentId = payload.appointmentId;
    if (!appointmentId) {
      const appointments = await ApiClient.get<any[]>('/v1/appointments');
      const active = appointments.filter(a => a.patient_id === payload.patientId && a.status === 'in_progress');
      if (active.length !== 1) throw new Error('Inicie o atendimento pela agenda para vincular paciente, profissional e serviço.');
      appointmentId = active[0].id;
    }
    const result = await ApiClient.post<any>(endpoint, { ...payload, appointmentId, saveOnly: true });
    if (result.alreadyCompleted) throw new Error('Este atendimento já foi finalizado. Abra o prontuário para consultar o histórico.');
    setReceipt({ ...result, appointmentId });
  };
  const dialog = receipt ? <ConsultationPaymentModal appointmentId={receipt.appointmentId} initialPayment={receipt.payment}
    onClose={() => { setReceipt(null); onFinished?.(); }} onFinished={() => { setReceipt(null); onFinished?.(); }} /> : null;
  return { save, dialog };
}
