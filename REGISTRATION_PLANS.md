# Fluxo público de cadastro e planos

## Planos reutilizados

| Nome | Código | ID | Mensalidade | Acessos |
|---|---|---|---|---|
| Zemda Solo | SOLO | zemda-SOLO | R$ 69,90 | 1 |
| Zemda Equipe | TEAM | zemda-TEAM | R$ 249,90 | 5 |
| Zemda Clínica | CLINIC | zemda-CLINIC | R$ 619,90 | 20 |

A fonte de preços continua sendo `plans`, consultada por `BillingService.plans()` e pelo endpoint público `/api/v1/plans`. Os cards não contêm preços ou IDs fixos. A periodicidade MONTHLY é compartilhada com a criação do checkout. Os benefícios gerais já exibidos em Assinatura e Plano foram extraídos para uma lista compartilhada; `features_json` dos três planos está vazio no banco local auditado.

## Fluxo

1. Dados, profissão, senha e aceites existentes.
2. Verificação do e-mail, sem criar conta nem emitir conversão.
3. Escolha do plano e criação transacional da conta.

Solo usa a criação de trial existente, com sete dias, datas de início/fim, plano salvo e entrada no painel, sem checkout. A duração foi centralizada em SOLO_TRIAL_DAYS e reutilizada pelas duas rotinas existentes de trial.

Equipe/Clínica salvam o ID em `tenants.plan_id`, mantêm tenant/usuário pendentes e billing_required. A seleção não ativa assinatura. Após autenticação, `/assinatura?checkout=1` abre os Dados de cobrança existentes para o plano salvo. CPF/CNPJ e endereço são exigências atuais da integração: ao salvar, a mesma função de checkout solicita a URL ao backend e redireciona ao Asaas. Falhas mantêm conta e formulário para nova tentativa. O resumo expõe selectedPlan separadamente do plano da assinatura ativa, permitindo retomar a contratação após login.

O draft do modal é mantido em memória ao fechar/reabrir e voltar etapas, inclusive profissão e plano. Senhas não são gravadas em armazenamento persistente. Recarregar a página descarta o draft. Se a verificação expirar, o usuário pode verificar novamente preservando seus dados.

## Confirmação e analytics

`BillingWebhookService` continua autenticando os eventos por meio da rota existente e consultando o pagamento no Asaas antes de ativar a assinatura. Nenhuma chave, wallet, webhook, preço ou regra de ciclo foi modificada.

- `sign_up`: `trackCompletedRegistration`, chamado no sucesso confirmado de `/v1/public/tenants/register`, após escolher plano.
- `trial_started`: a mesma função, apenas quando a resposta confirma isTrial; Solo neste fluxo.
- `purchase`: `trackConfirmedPurchase` em `purchaseAnalytics.ts`, chamado por BillingView na página de retorno de sucesso, somente quando o resumo autenticado contém assinatura ACTIVE e pagamento CONFIRMED/RECEIVED da assinatura corrente. O backend fornece apenas ID interno da transação e valor real. Não usa parâmetros do retorno para inferir pagamento.

Eventos respeitam o consentimento de analytics. Purchase usa currency BRL, valor real e transaction_id estável, com deduplicação em memória/localStorage e contextos de página sem dados pessoais. Re-render, consulta periódica e reload no mesmo navegador não reenviam a transação. O transaction_id também permite deduplicação no GA4. Como se trata de tracking no navegador, depende de consentimento, SDK e retorno/permanência na página de confirmação; não foi criada API de Conversões ou Measurement Protocol.

## Arquivos

- backend/src/controllers/tenant.controller.ts
- backend/src/controllers/billing.controller.ts
- backend/src/services/billing.service.ts
- backend/test-billing.cjs
- frontend/src/components/auth/CreateClinicModal.tsx
- frontend/src/components/auth/RegistrationPlans.tsx
- frontend/src/components/billing/BillingView.tsx
- frontend/src/components/billing/billingBenefits.ts
- frontend/src/utils/purchaseAnalytics.ts
- frontend/tests/registration-plans-browser.cjs
- frontend/tests/registration-analytics.cjs
- frontend/tests/registration-professions-browser.cjs
- REGISTRATION_PLANS.md

## Validação

Testes em SQLite temporário e gateway simulado: cadastro dos três planos, trial Solo de sete dias sem cobrança, persistência dos planos/profissão, checkout pago dos dois planos, erro de checkout, cancelamento, recusa, nova tentativa e confirmação por webhook. Regressões de cobrança incluem limites 1/5/20, duplicação de eventos, carência, suspensão, reativação, mudança de plano, cancelamento e isolamento de permissões.

Testes de navegador com componentes reais e fronteiras HTTP simuladas: três escolhas em mobile/desktop, preservação do formulário, fluxo de dados de cobrança para ambos os planos pagos, erro e retry, sign_up único, trial somente no Solo e purchase após confirmação. Foram mantidos os 28 testes de analytics e os sete perfis de profissão; 52 cadastros de profissão também passaram no controller real.

Build frontend (TypeScript + Vite) e backend (TypeScript) executados. Nenhuma migration necessária; nenhum cadastro, cobrança ou pagamento real foi realizado pelos testes. Validação de cobrança real no Asaas não foi executada.
