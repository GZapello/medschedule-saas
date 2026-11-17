// Financial status and a successful HTTP response do not confirm an appointment.
export function bookingStatusLabel(status: unknown): string {
  const labels: Record<string, string> = {
    confirmed: 'Confirmado', scheduled: 'Agendado — confirmação não informada',
    pending: 'Aguardando confirmação', pending_confirmation: 'Aguardando confirmação',
    awaiting_confirmation: 'Aguardando confirmação', requested: 'Aguardando confirmação',
    cancelled: 'Cancelado', completed: 'Concluído', in_progress: 'Em atendimento', no_show: 'Não compareceu'
  };
  return typeof status === 'string' ? labels[status] || 'Confirmação não informada' : 'Confirmação não informada';
}

export function publicBookingOutcome(result: any) {
  const appointments: any[] = Array.isArray(result?.appointments) ? result.appointments : [];
  const statuses = appointments.length ? appointments.map(a => a.status ?? result?.status) : [result?.status];
  const confirmed = statuses.every(status => status === 'confirmed');
  const pending = statuses.some(status => ['pending', 'pending_confirmation', 'awaiting_confirmation', 'requested'].includes(status));
  return {
    confirmed,
    title: confirmed ? 'Agendamento confirmado!' : 'Solicitação recebida!',
    label: confirmed ? 'Confirmado' : pending ? 'Aguardando confirmação' : statuses.every(status => status === statuses[0]) ? bookingStatusLabel(statuses[0]) : 'Confirmação não informada',
    message: confirmed
      ? 'Seu agendamento foi confirmado com sucesso. Confira abaixo as informações do seu atendimento.'
      : pending
        ? 'Recebemos sua solicitação de agendamento. O estabelecimento deverá confirmar a disponibilidade do horário antes de adicioná-lo à agenda definitiva.'
        : 'Recebemos sua solicitação. A resposta do estabelecimento não informa a confirmação do horário. Consulte o estabelecimento antes de considerar seu atendimento confirmado.',
    next: confirmed ? 'Compareça ou acesse o atendimento no horário marcado, conforme a modalidade.' : 'Aguarde a confirmação do estabelecimento.'
  };
}
