import { ApiClient } from '../../api/client';

/** Resolve the encounter independently of how the clinical module was opened. */
export async function resolveConsultationAppointment(payload: { patientId?: string; appointmentId?: string | null; moduleType?: string }) {
  if (!payload.patientId) throw new Error('Selecione um paciente para finalizar o atendimento.');
  if (payload.appointmentId) return payload.appointmentId;
  const result = await ApiClient.post<{ appointmentId: string }>('/v1/clinical/consultations/start', {
    patientId: payload.patientId, moduleType: payload.moduleType || 'general', walkIn: true
  });
  if (!result.appointmentId) throw new Error('Não foi possível vincular o atendimento ao paciente.');
  return result.appointmentId;
}
