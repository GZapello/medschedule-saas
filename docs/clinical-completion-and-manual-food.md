# Atendimento direto e alimentos manuais

Todos os módulos usam o cabeçalho de finalização e a resolução compartilhada em `resolveConsultationAppointment`. Os módulos com formulários próprios usam `useConsultationCompletion`; General, Personal e Estetic usam o mesmo resolvedor antes de abrir o formulário global. Módulos futuros devem reutilizar esses componentes.

A API `/v1/clinical/consultations/start` vincula a entrada direta ao profissional autenticado, reutiliza um atendimento em andamento ou um agendamento do dia e cria o contexto quando necessário. A consulta e criação ocorrem na mesma transação. O fluxo da Agenda continua usando seu identificador original. Sem paciente, a finalização solicita seleção; o resumo permite confirmar ou voltar para editar. A conclusão preserva os dados no prontuário e dispara os eventos de atualização da Agenda e histórico. Os bloqueios existentes de clínica, profissão, paciente e atendimento continuam aplicados.

No Nutri, o botão + ao lado de cada refeição abre o cadastro manual. Os nutrientes correspondem à quantidade informada, não a 100 g. O item guarda `source: manual`, `quantity`, `unit`, `notes` e os nutrientes no JSON do cardápio, sem gravar na tabela de alimentos. Busca TACO/TBCA, substituições e receitas permanecem disponíveis. Alimentos manuais podem ser editados e removidos na mesma lista.

Os totalizadores agregam as duas origens. O backend recalcula os totais ao salvar o plano; a evolução final inclui o cardápio, e o acompanhamento para impressão/PDF inclui porção, observação, nutrientes, totais das refeições e total diário.

Validação: `npm run test:clinical-completion --prefix frontend`; `npm run build --prefix backend` e `node run-tests.cjs test-consultations.cjs test-universal-clinical-autosave.cjs test-clinical-module-resolution.cjs` (executar o runner a partir de backend). Os testes usam banco temporário e interface com dados simulados, sem alterar dados de clínicas.
