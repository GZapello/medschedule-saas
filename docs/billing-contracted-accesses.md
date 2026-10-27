# Planos e acessos contratados

| Plano | Base mensal | Incluídos | Adicional mensal | Máximo total |
| --- | ---: | ---: | ---: | ---: |
| Solo | R$ 69,90 | 1 | R$ 59,90 | 3 |
| Equipe | R$ 249,90 | 5 | R$ 44,90 | 12 |
| Clínica | R$ 619,90 | 15 | R$ 29,90 | Sem teto comercial |

O backend calcula em centavos: base + max(0, total contratado − incluídos) × adicional. O frontend envia apenas `planCode` e `contractedUsers`; valores enviados pelo cliente são ignorados. Exemplos: Solo 2 = R$ 129,80; Equipe 7 = R$ 339,70; Clínica 18 = R$ 709,60.

## Migração aditiva

`backend/src/config/billing-migration.ts` adiciona `plans.extra_user_price`, `plans.total_user_limit`, `subscriptions.contracted_users` e `subscriptions.pending_contracted_users`. Atualiza o incluído de Clínica de 20 para 15 e recria a view `billing_user_limits` e seus triggers. A migração é idempotente e não remove usuários, pacientes, clínicas ou histórico de trial.

Contratos antigos sem quantidade explícita usam o incluído do plano. Usuários existentes acima desse limite não são apagados ou desativados; a clínica deve contratar o total necessário ou desativar acessos antes de novas ativações. A migração não realiza chamadas ao Asaas nem contrata adicionais automaticamente.

## Ciclo da contratação

- Checkout novo grava o total contratado antes de chamar o Asaas e cobra o valor calculado no servidor.
- Uma assinatura ativa agenda alterações de plano/quantidade para a próxima renovação. O Asaas recebe o novo valor com `updatePendingPayments: true`; o webhook confirma a nova quantidade após pagamento. Não há cobrança proporcional imediata.
- Reduções exigem uso ativo compatível. Durante uma redução programada, os triggers já impedem ocupar vagas que excederiam o próximo contrato.
- Troca de plano sem quantidade explícita preserva o total contratado, respeitando o incluído do destino. Se exceder o teto de Solo/Equipe, exige redução explícita.
- Operações pendentes/ambíguas bloqueiam novas alterações até conciliação. Checkouts abertos só são reutilizados para o mesmo ambiente, plano e quantidade.
- Usuário ou vínculo desativado libera vaga; convite e ativação verificam capacidade. Triggers protegem também escritas diretas.

## Trial e isolamento

Um trial local `managed=1` sem ambiente/identificadores Asaas pode iniciar checkout no ambiente atual. Assinaturas com vínculo ao gateway continuam sujeitas à validação de ambiente. O trial Solo permanece exatamente 7 × 24 horas.

Abrir ou cancelar checkout não converte o trial. A conversão do histórico ocorre após pagamento confirmado. A expiração posterior de um trial antigo não sobrescreve o histórico convertido. A sincronização de preços considera adicionais e só opera no ambiente atual, sem sobrescrever alterações programadas.

## Validação isolada

Os testes usam bancos temporários e Asaas mock, com bloqueio de rede externa na suíte financeira. Não é necessária nem executada cobrança real.

Comandos: `npm run test:billing` no backend e frontend; `node test-solo-trial.cjs` e `node test-free-trial-activation-atomic.cjs` no backend; `node tests/registration-plans-browser.cjs` no frontend. Builds: `npm run build` em ambos. Os testes E2E relevantes cobrem cadastro, onboarding, convites, acesso, SuperAdmin e landing.

Resultados em 27/10/2026:

- Suíte de billing expandida: passou, incluindo os 11 cenários solicitados, rejeição de pagamento abaixo do contrato, retenção de paciente/usuário/histórico e migração idempotente.
- Billing/onboarding: 117 verificações passaram.
- Trial Solo: 10 testes passaram. Ativação atômica: 22 verificações passaram.
- Frontend billing: 45 cenários de acesso + 13 de carregamento passaram.
- Cards/contratação em navegador: desktop e celular passaram; o payload envia somente plano e quantidade.
- E2E selecionados: 10 passaram em 41,5 s (cadastro via navegador/API, convite, autorização, boas-vindas, landing em três tamanhos e SuperAdmin).
- Builds backend/frontend e `git diff --check`: passaram. Vite mantém aviso de chunk acima de 500 kB.

A seleção inicial mais ampla de E2E também incluiu tours clínicos fora do fluxo financeiro; foi interrompida após encontrar a conta de fixture ausente `tour-reception`. A aprovação acima refere-se aos 10 E2E relevantes executados integralmente, não à suíte completa de tours. As expectativas antigas de bloqueio financeiro e do botão renomeado para “Painel” foram corrigidas nos testes de onboarding.

Não houve validação contra uma conta Asaas externa nem migração de banco de produção nesta execução.
