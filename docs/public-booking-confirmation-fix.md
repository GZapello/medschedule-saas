# Correção da confirmação do agendamento público

O endpoint `POST /v1/public/appointments` abria uma transação para gravar o agendamento. Dentro dela, `BillingService.expireGrace()` abria outra transação com `BEGIN IMMEDIATE`. O SQLite não aceita esse aninhamento; a resposta era HTTP 500 com a mensagem genérica exibida no formulário.

A atualização de assinaturas agora ocorre antes da transação do agendamento. A autorização da assinatura continua sendo verificada antes de gravar o paciente/agendamento. A gravação do agendamento continua atômica, incluindo rollback em falhas.

O teste público anterior substituía `expireGrace` por uma função vazia, ocultando o problema. Removida essa substituição, o teste reproduziu o erro (500 em vez de 201); com a correção, passou.

Validação em banco temporário: link da clínica e link individual, confirmação, conflito de horário, requisições concorrentes, rollback de falha simulada, links antigos e controles de disponibilidade/permissão. Build do backend aprovado. Nenhum agendamento foi criado em produção durante a investigação.
