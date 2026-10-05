# Finalizar Atendimento — validação

Branch: `codex/finalizar-atendimento`.

## Atualização: atendimento sem horário marcado no Estetic

A pedido do usuário, a regra anterior de ocultar a finalização na sidebar foi alterada **para o Estetic**. Ao selecionar um paciente, Finalizar Atendimento aparece no cabeçalho e após Histórico Completo. O clique chama a rota existente de início de consulta e depois abre o modal universal com o ID retornado.

O início identifica o profissional ativo vinculado ao usuário, retoma um atendimento compatível desse profissional/paciente ou cria um agendamento real. Não usa outro profissional como fallback nesse fluxo. Um serviço ativo cadastrado é obrigatório; não se usa ID fictício. A criação do contexto não troca a chave do formulário e não apaga campos preenchidos. Cancelar o modal mantém o atendimento em andamento para retomada.

Validação adicional: criação e reutilização pela API real, profissional vinculado ao usuário, persistência da evolução e dos dados estruturados; navegador: sidebar → paciente → Finalizar Atendimento → revisão → conclusão. Builds frontend e backend aprovados. Os resultados abaixo sobre ausência do botão na sidebar representam a regra anterior; os demais módulos continuam com essa regra.

## Correções

- Personal recebe o ID real do agendamento e o callback do orquestrador. O cabeçalho abre o modal universal; o aluno permanece fixado ao atendimento.
- Estetic usa a presença do agendamento, independentemente do callback, para mostrar a ação. A rota universal reutiliza `getEsteticAccess`, o mesmo verificador do módulo.
- Estetic também oferece a ação na barra horizontal, imediatamente após Histórico Completo. Os testes de Dashboard e Agenda finalizam por esse acesso. A rota direta `/zemda-estetic/pacientes/:id` fornece apenas o paciente; continua sem ação de conclusão quando não há agendamento vinculado.
- Todos os 11 módulos escondem as ações de finalização sem agendamento. Os formulários e endpoints específicos foram preservados.
- Geral lê o envelope `{ appointment }` da API. Finalizar abre a revisão e grava pelo fluxo universal, sem criar um registro antecipado a cada tentativa. O formulário completo acompanha a evolução em `moduleData`; cancelar mantém o atendimento aberto.
- Modal universal e hook compartilhado bloqueiam submissões repetidas e emitem o evento `zemda-appointment-updated`, ouvido pelo Dashboard e pela Agenda. Rascunhos são limpos após sucesso; falhas mantêm os campos.
- Med, Psico e PP rejeitam uma segunda finalização no backend, antes de criar registros. A proibição de concluir por alteração direta de status permanece intacta.
- A resolução de profissão consultava duas colunas inexistentes em `clinic_users`. Usa agora os campos persistidos `profession_id` e `profession_name`, mantendo a resolução canônica e as flags existentes.

## Matriz executada

| Módulo | Botão com agendamento, sem callback | Sem botão na navegação direta | API real: registro, completed, repetição e reabertura | Alteração |
|---|---|---|---|---|
| Med | Passou | Passou | Passou | Condição de exibição e bloqueio de repetição no backend |
| Odonto | Passou | Passou | Passou | Condição de exibição |
| Nutri | Passou | Passou | Passou | Condição de exibição e aba de finalização |
| TO | Passou | Passou | Passou | Condição de exibição e aba de finalização |
| Fono | Passou | Passou | Passou | Condição de exibição e aba de finalização |
| Psico | Passou | Passou | Passou | Condição dos dois botões e bloqueio de repetição no backend |
| PP | Passou | Passou | Passou | Condição de exibição/aba e bloqueio de repetição no backend |
| Fisio | Passou | Passou | Passou | Condição de exibição e aba de finalização |
| Estetic | Passou | Passou | Passou | Condição, limpeza após sucesso e verificador de acesso universal |
| Personal | Passou | Passou | Passou | Integração de finalização adicionada |
| Geral | Passou | Passou | Passou | Envelope da API, condição e gravação universal com formulário completo |

Testes de navegador adicionais com componentes reais e API simulada:

- Dashboard → Atender → Estetic → finalizar → atualizar indicadores → fechar: passou.
- Agenda → Iniciar → Estetic → finalizar → recarregar agenda → fechar: passou.
- Dashboard → Atender → Personal → finalizar → atualizar indicadores → fechar: passou.
- Agenda → Iniciar → Personal → finalizar → recarregar agenda → fechar: passou.
- Falha de rede e cancelamento da revisão preservam evolução e rascunho; nova tentativa conclui, limpa o rascunho, remove o botão e chama o callback: passou.
- Geral envia o ID do agendamento e o formulário completo em uma única requisição de finalização: passou.
- Orquestrador bloqueia abertura de formulário para agendamento concluído: passou.

Integração HTTP real com banco SQLite temporário, sem dados da clínica: os 11 endpoints salvaram evolução, marcaram `completed`, bloquearam conclusão direta via status, impediram registros duplicados na repetição e retornaram `alreadyCompleted` na reabertura. Os endpoints específicos existentes foram usados para Med, Odonto, Nutri, TO, Fono, Psico, PP e Fisio.

## Reprodução e limites

```text
cd backend
npm run build
node test-finish-all-modules.cjs

cd ../frontend
npm run build
node tests/consultation-completion-browser.cjs
```

O teste de navegador usa Playwright e Chrome. `PLAYWRIGHT_MODULE` permite apontar para o pacote disponível no ambiente e `CHROME_PATH` para um Chrome instalado. Esbuild vem das dependências do frontend.

Frontend e backend: builds aprovados. Vite mantém o aviso de bundle acima de 500 kB; não há erro de compilação.

A cobertura combina testes de componentes em navegador com API simulada e testes de endpoints reais em banco isolado. Não houve validação no Railway/produção, nem percurso visual completo de cada formulário especializado. Não foi feito merge.
