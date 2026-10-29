export function bookingError(error: { status?: number; message?: string; code?: string } | null): { title: string; message: string } {
  const status = error?.status;
  if (status === 409) return { title: 'Horário indisponível', message: error?.message || 'O horário foi ocupado. Atualize a lista e escolha outro.' };
  if (status === 401 || status === 403) return { title: 'Acesso não autorizado', message: status === 401 ? 'Sua sessão expirou. Entre novamente para agendar.' : 'Você não tem permissão para realizar este agendamento.' };
  if (status === 402) return { title: 'Agendamento indisponível', message: 'A clínica precisa regularizar o acesso. Contate o responsável.' };
  if (status === 400 || status === 422) return { title: 'Revise os dados', message: error?.message || 'Confira os campos obrigatórios e o horário escolhido.' };
  if (status === 503 && error?.code === 'GOOGLE_AVAILABILITY_UNAVAILABLE') return { title: 'Disponibilidade não confirmada', message: 'Não foi possível consultar a disponibilidade Google. Tente novamente.' };
  if (status && status >= 500) return { title: 'Não foi possível concluir', message: 'O servidor não conseguiu concluir a operação. Atualize a agenda antes de tentar novamente. Se persistir, contate o suporte.' };
  return { title: 'Falha de conexão', message: 'Não foi possível confirmar a resposta. Confira sua conexão e atualize a agenda antes de tentar novamente.' };
}
