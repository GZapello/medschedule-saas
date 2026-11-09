import { ApiClient } from '../../api/client';

const inFlightResolutions = new Map<string, Promise<string>>();

/** Resolve the encounter independently of how the clinical module was opened. */
export async function resolveConsultationAppointment(payload: { patientId?: string; appointmentId?: string | null; moduleType?: string }) {
  if (!payload.patientId) throw new Error('Selecione um paciente para finalizar o atendimento.');
  if (payload.appointmentId) return payload.appointmentId;

  const key = `${payload.patientId}:${payload.moduleType || 'general'}`;
  const existingPromise = inFlightResolutions.get(key);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    try {
      const result = await ApiClient.post<{ appointmentId: string }>('/v1/clinical/consultations/start', {
        patientId: payload.patientId,
        moduleType: payload.moduleType || 'general',
        walkIn: true
      });
      if (!result.appointmentId) throw new Error('Não foi possível vincular o atendimento ao paciente.');
      return result.appointmentId;
    } finally {
      inFlightResolutions.delete(key);
    }
  })();

  inFlightResolutions.set(key, promise);
  return promise;
}
