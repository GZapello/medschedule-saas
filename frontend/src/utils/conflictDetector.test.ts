import { detectAppointmentConflict } from './conflictDetector';
import { Appointment } from '../types/appointment';

// Suite de validação do algoritmo de colisão de horários e buffer de descompressão
function runTests() {
  console.log('--- Iniciando Testes Unitários: ConflictDetector ---');

  const mockExisting: Appointment[] = [
    {
      id: 'appt-1',
      patientName: 'Paciente Existente 1',
      patientPhone: '11999999999',
      professionalId: 'prof-1',
      specialty: 'psychology',
      startTime: '2026-09-09T14:00:00.000Z',
      endTime: '2026-09-09T14:50:00.000Z',
      status: 'confirmed',
      clinicalMetadata: {
        sessionType: 'individual',
        recurrencePattern: 'weekly',
        decompressionBufferMinutes: 10
      },
      createdAt: '2026-09-09T10:00:00.000Z',
      updatedAt: '2026-09-09T10:00:00.000Z',
      isDeleted: false,
      version: 1
    }
  ];

  // Caso 1: Sobreposição exata de horário para o mesmo profissional
  const test1 = detectAppointmentConflict(
    {
      professionalId: 'prof-1',
      startTime: '2026-09-09T14:15:00.000Z',
      endTime: '2026-09-09T14:45:00.000Z'
    },
    mockExisting
  );
  console.assert(test1.hasConflict === true && test1.type === 'HARD_OVERLAP', 'Teste 1 Falhou!');
  console.log('✔ Caso 1: Sobreposição direta detectada e bloqueada com sucesso.');

  // Caso 2: Horário livre para profissional diferente
  const test2 = detectAppointmentConflict(
    {
      professionalId: 'prof-2',
      startTime: '2026-09-09T14:00:00.000Z',
      endTime: '2026-09-09T14:50:00.000Z'
    },
    mockExisting
  );
  console.assert(test2.hasConflict === false, 'Teste 2 Falhou!');
  console.log('✔ Caso 2: Profissionais diferentes no mesmo horário permitido com sucesso.');

  // Caso 3: Violação do buffer de descompressão (10 min de buffer após 14:50 -> livre após 15:00)
  const test3 = detectAppointmentConflict(
    {
      professionalId: 'prof-1',
      startTime: '2026-09-09T14:55:00.000Z',
      endTime: '2026-09-09T15:45:00.000Z',
      bufferMinutes: 10
    },
    mockExisting
  );
  console.assert(test3.hasConflict === true && test3.type === 'BUFFER_VIOLATION', 'Teste 3 Falhou!');
  console.log('✔ Caso 3: Violação de intervalo de descompressão clínico alertada com sucesso.');

  // Caso 4: Horário respeitando o término + buffer (início às 15:00)
  const test4 = detectAppointmentConflict(
    {
      professionalId: 'prof-1',
      startTime: '2026-09-09T15:00:00.000Z',
      endTime: '2026-09-09T15:50:00.000Z',
      bufferMinutes: 10
    },
    mockExisting
  );
  console.assert(test4.hasConflict === false, 'Teste 4 Falhou!');
  console.log('✔ Caso 4: Agendamento posterior ao buffer permitido com sucesso.');

  console.log('--- Todos os testes do ConflictDetector passaram com sucesso! ---');
}

runTests();
