import { Appointment } from '../types/appointment';

export interface ConflictResult {
  hasConflict: boolean;
  type?: 'HARD_OVERLAP' | 'BUFFER_VIOLATION';
  message?: string;
  conflictingAppointment?: Appointment;
}

/**
 * Algoritmo de Detecção de Conflitos e Sobreposição de Agendamentos
 *
 * Fórmula base de colisão temporal:
 * Sejam dois intervalos [A_start, A_end] e [B_start, B_end] com tempos de buffer [A_buf, B_buf]:
 * - Hard Overlap: (A_start < B_end) && (A_end > B_start)
 * - Buffer Violation: (A_start < B_end + B_buf) && (A_end + A_buf > B_start)
 */
export function detectAppointmentConflict(
  target: {
    startTime: string;
    endTime: string;
    professionalId: string;
    id?: string;
    bufferMinutes?: number;
  },
  existingAppointments: Appointment[]
): ConflictResult {
  const targetStart = new Date(target.startTime).getTime();
  const targetEnd = new Date(target.endTime).getTime();
  const targetBufferMs = (target.bufferMinutes || 0) * 60 * 1000;

  if (targetStart >= targetEnd) {
    return {
      hasConflict: true,
      message: 'O horário de término deve ser posterior ao horário de início.'
    };
  }

  for (const appt of existingAppointments) {
    // Ignora o próprio agendamento (em caso de edição) ou agendamentos deletados/cancelados
    if (appt.id === target.id || appt.isDeleted || appt.status === 'cancelled' || appt.status === 'no_show') {
      continue;
    }

    // Conflitos só ocorrem para o mesmo profissional
    if (appt.professionalId !== target.professionalId) {
      continue;
    }

    const apptStart = new Date(appt.startTime).getTime();
    const apptEnd = new Date(appt.endTime).getTime();

    // 1. Verifica sobreposição direta (Hard Overlap)
    const isDirectOverlap = targetStart < apptEnd && targetEnd > apptStart;
    if (isDirectOverlap) {
      return {
        hasConflict: true,
        type: 'HARD_OVERLAP',
        message: `Conflito de horário! O profissional já possui atendimento com "${appt.patientName}" entre ${new Date(appt.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} e ${new Date(appt.endTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
        conflictingAppointment: appt
      };
    }

    // 2. Verifica violação de buffer de descompressão/preparação
    const apptBufferMinutes =
      (appt.clinicalMetadata && 'decompressionBufferMinutes' in appt.clinicalMetadata
        ? (appt.clinicalMetadata as any).decompressionBufferMinutes
        : 0) || 0;

    const totalBufferMs = Math.max(targetBufferMs, apptBufferMinutes * 60 * 1000);

    if (totalBufferMs > 0) {
      const violatesBuffer =
        targetStart < apptEnd + totalBufferMs &&
        targetEnd + totalBufferMs > apptStart;

      if (violatesBuffer) {
        return {
          hasConflict: true,
          type: 'BUFFER_VIOLATION',
          message: `Atenção: O agendamento invade o intervalo obrigatório de descompressão/prontuário (${totalBufferMs / 60000} min) antes ou após o atendimento de "${appt.patientName}".`,
          conflictingAppointment: appt
        };
      }
    }
  }

  return { hasConflict: false };
}
