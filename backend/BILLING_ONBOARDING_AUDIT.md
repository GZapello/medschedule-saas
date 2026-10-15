# Zemda — correção de billing, onboarding e trial único

Data: 14/10/2026. Implementação local; esta correção ainda não foi publicada no Railway. Não houve consulta nem alteração do banco de produção, criação de cobranças reais ou cobrança automática.

## 1. Causa exata do bypass

Havia quatro falhas combinadas:

- `App.tsx` exigia `!isUserActive` para bloquear billing, permitindo que `onboardingStatus === 'active'` ignorasse `canOperate === false`.
- `getCurrentState()` aceitava `tenant.plan_id` com tenant ativo como prova de contratação e procurava assinaturas históricas sem restringir `is_current` nem validade.
- `selectPlan()` avançava planos pagos para `pending_profile`, enquanto `completeProfile()` ativava conta/clínica sem conferir direito financeiro.
- O middleware de assinatura vinha depois das APIs de compartilhamento de pacientes. A seleção de plano também podia zerar `trial_used`; a criação de trial estava duplicada em quatro caminhos, com verificações diferentes.

## 2. Arquivos alterados

Backend:

- `src/services/billing.service.ts`: decisão financeira, elegibilidade, criação transacional e notificações de trial.
- `src/controllers/onboarding.controller.ts`: estado real, escolha de plano e validação antes da conclusão profissional.
- `src/controllers/tenant.controller.ts`: cadastro comercial, plano real e resumo administrativo multi-clínica.
- `src/controllers/auth.controller.ts`: cadastro Google usando a mesma regra comercial.
- `src/controllers/billing.controller.ts`: exceções de regularização e erro padronizado.
- `src/routes/index.ts`: middleware antes das APIs operacionais autenticadas.
- `src/services/billing-webhook.service.ts`: pagamento confirmado libera a etapa profissional pendente.
- `src/services/clinic-team.service.ts` (novo): equipe por vínculo, com compatibilidade legada.
- `src/config/billing-migration.ts`: excluir pacientes/SuperAdmin da ocupação; limitar alterações de vínculo à clínica afetada.
- `test-billing.cjs`, `test-billing-onboarding.cjs` (novo) e `package.json`: regressões e comando integrado.

Frontend:

- `src/App.tsx`: bloqueio independente de conta ativa e de contadores locais.
- `src/components/auth/CreateClinicModal.tsx`: encaminhamento ao pagamento e retomada pelo estado do servidor.
- `src/components/billing/BillingView.tsx`: trial elegível, contratação paga após uso, isolamento de respostas por usuário/clínica e falha de consulta fechando o acesso.
- `src/api/client.ts`: recusa financeira da API invalida a liberação na interface imediatamente.
- `src/components/superadmin/SuperAdminView.tsx`: plano, status financeiro, acessos e profissionais ativos em layout responsivo.
- `tests/billing-access.cjs` (novo), `tests/mobile-overflow.cjs` e `package.json`: testes de navegador e fixture com `canOperate` explícito.

## 3. Estado do onboarding

Fluxo pago: `pending_verification → pending_plan → pending_payment → pending_profile → active`.

Selecionar Equipe/Clínica grava somente intenção. O retorno inclui `requiresCheckout: true`; não cria assinatura ativa e não avança para perfil profissional. Após confirmação confiável do pagamento, o webhook muda `pending_payment` para `pending_profile`. Concluir o perfil sem direito financeiro retorna HTTP 402 e mantém `pending_payment`.

Fluxo Solo: verificação de identidade → trial comercial único → perfil profissional → operação enquanto o trial for válido. Um trial criado durante cadastro local/Google é retomado pelo estado real do servidor, sem criar outra assinatura.

## 4. Fonte de verdade e middleware

Foi reutilizado `subscriptionGate`, agora imediatamente após autenticação e resolução de tenant. `canOperate()` exige clínica operacional e usa `hasBillingEntitlement()` para a decisão financeira comum. A conclusão inicial do perfil consulta essa mesma decisão financeira, antes da ativação cadastral.

Para `billing_required=1`: assinatura atual gerenciada, trial dentro da validade, período ACTIVE válido, carência PAST_DUE permitida pelas regras existentes ou CANCELED ainda dentro do período pago. Plano selecionado e status da conta não concedem acesso. Ausência de assinatura, PENDING_PAYMENT, TRIAL_EXPIRED e SUSPENDED negam operação.

Clínicas `billing_required=0` preservam sua dispensa de cobrança. As exceções administrativas do SuperAdmin e os fluxos próprios de Sandbox foram preservados.

## 5. Proteção de acesso direto

As APIs operacionais, incluindo compartilhamento entre clínicas, retornam HTTP 402 com `code: BILLING_ACCESS_REQUIRED` e `billingStatus`. Alterar a interface, rota ou armazenamento local não modifica essa decisão do servidor.

Continuam disponíveis os fluxos de autenticação, troca de clínica, onboarding, planos, assinatura, checkout, perfil de cobrança, suporte e metadados necessários ao cadastro. Webhook e páginas públicas mantêm suas rotas próprias. A tela operacional também fica fechada enquanto não houver resposta financeira válida, após falha de consulta ou durante troca de clínica; uma resposta atrasada de outra clínica não pode liberar a atual.

## 6. Pontos de criação de trial encontrados

Comerciais, agora centralizados:

1. `BillingService.startSoloTrial()` / `/v1/subscriptions/start-trial`.
2. `OnboardingController.selectPlan()`.
3. `TenantController.registerPublic()` quando solicitado `startTrial`.
4. `AuthController.googleAuth()` no contexto `signup`.

Administrativos, mantidos separados:

5. `FreeTrialController.activate()` por token concedido pelo SuperAdmin.
6. `AuthController.googleAuth()` no contexto `trial`, também mediante token administrativo.
7. `FreeTrialController.updateValidity()`: concessão/ajuste explícito de validade pelo SuperAdmin; não constitui botão de renovação comercial.

## 7. Regra central de trial único

`assertTrialEligibility()` verifica flag da clínica, qualquer histórico (ACTIVE, EXPIRED ou CONVERTED), usuário, e-mails normalizados, CPF/CNPJ normalizados, assinaturas anteriores com evidência de trial e concessões administrativas já ativadas. Contratações gerenciadas existentes também impedem iniciar trial comercial por cima de uma assinatura/checkout.

Todos os caminhos comerciais chamam `createSoloTrialInTransaction()`. A verificação, assinatura, histórico, auditoria e `trial_used=1` participam da mesma transação síncrona SQLite. As transações de cadastro já existentes são reutilizadas. Chamadas concorrentes não geram dois trials.

O início e término são gravados uma vez, com diferença exata de `7 × 24 horas`. A seleção de outro plano não redefine `trial_used`. Foi removida a exclusão da assinatura TRIAL no onboarding. As notificações usam os timestamps persistidos, após o commit.

## 8. Após sete dias

O término é comparado ao relógio atual; o contador deriva exclusivamente de `trial_ends_at - agora`. A expiração existente passa TRIAL para TRIAL_EXPIRED, registra auditoria e atualiza o histórico. `canOperate` também recusa um término vencido antes da transição persistida.

APIs e telas operacionais ficam bloqueadas. Nenhum paciente, prontuário ou agenda é apagado. O botão passa a **Assinar Zemda Solo** e chama checkout pago. A chamada direta a `start-trial` após uso retorna `TRIAL_ALREADY_USED`, sem alterar término ou criar outro histórico.

## 9. Checkout de Equipe e Clínica

O onboarding encaminha para `/assinatura?checkout=1`. A interface reutiliza o perfil de cobrança e `/v1/subscriptions/checkout`, incluindo reutilização de checkout pendente e validação de endereço existentes. Apenas a reconciliação/webhook confiável pode confirmar pagamento; retorno do checkout e escolha de plano não ativam a contratação.

Foram preservados Asaas, checkout hospedado, preços, limites, ambiente, webhook autenticado, conciliação, alteração de plano, cancelamento e histórico. Os testes usam gateway simulado e bloqueiam cobranças externas.

## 10. Campos e interface do SuperAdmin

A listagem retorna assinatura `is_current=1`: `subscription_status`, `subscription_plan_code`, `subscription_plan_name`, `subscription_max_users`, `trial_ends_at`, `current_period_end`, `managed`, `active_users`, `trial_days_remaining`, `can_operate`, intenção `selected_plan_code` e identificação de teste administrativo.

A coluna **Plano / Assinatura** distingue teste, ativo, período encerrado, pagamento pendente, suspensão, cancelamento, ausência de assinatura e plano apenas selecionado. O resumo apresenta plano, estado financeiro, ocupação/limite e permissão operacional. Testes administrativos recebem identificação própria.

## 11. Profissionais e contagens multi-clínica

`clinicTeam()` usa `clinic_users JOIN users` como fonte principal e associa o registro profissional da clínica selecionada. O fallback por `users.tenant_id` só vale se aquele vínculo estiver ausente; nunca sobrepõe vínculo inativo existente.

A lista ativa exige conta e vínculo ativos, sem duplicar usuário. Exclui pacientes e SuperAdmin. Retorna nome, e-mail, profissão, papel na clínica, status e registro profissional. A ocupação financeira também exclui pacientes/SuperAdmin.

O texto do modal passou a: **“Visão administrativa da clínica. Dados clínicos dos pacientes não são exibidos.”** Nenhum conteúdo clínico individual foi adicionado ao resumo.

## 12. Estados inconsistentes existentes

Uma clínica marcada como ativa, com onboarding completo e `tenant.plan_id` pago, mas sem assinatura válida, passa a aparecer sem assinatura/pagamento necessário e tem a operação bloqueada. Seus dados são preservados. O responsável pode consultar e regularizar assinatura/perfil de cobrança.

Não foi criada assinatura paga retroativa, nem foi executada cobrança ou limpeza de dados. Não é necessária atualização destrutiva dos tenants para aplicar a regra. A migração de ocupação/vínculos foi testada em inicializações repetidas do banco descartável.

## 13. Testes executados

- `npm run test:billing --prefix backend`: **PASS**, inclui build TypeScript, suíte existente de checkout/webhook/reconciliação e nova suíte com **117 verificações**.
- `npm run build --prefix frontend`: **PASS**, TypeScript e Vite. Permanece o aviso de tamanho de alguns bundles.
- `npm run test:billing --prefix frontend`: **PASS**, **45 casos de navegador**, mobile e desktop, incluindo contas ativas bloqueadas em Dashboard, Agenda, Pacientes e módulo médico; erro/espera de consulta; recusa durante sessão; Solo expirado chamando checkout pago; plano e equipe no resumo SuperAdmin.
- `git diff --check`: **PASS**.

As regressões de backend cobrem cadastro e OTP reais, Equipe/Clínica sem pagamento, pagamento confirmado no Asaas simulado, assinatura corrente, trial exato de sete dias, expiração e preservação de paciente, repetição direta, concorrência, histórico em todos os estados, identidade normalizada, Google com a mesma regra, carência/cancelamento, legados sem cobrança, concessão administrativa consumida, equipe de outra clínica e exclusão de pacientes da contagem.

Evidências locais em `frontend/test-results/`: `billing-full.log`, `billing-frontend-build.log`, `billing-browser.log`, `billing-access/results.json` e capturas da interface. Esses arquivos de teste são ignorados pelo Git.

Limites da validação: Google token e Asaas foram simulados nos testes; não houve pagamento real ou teste sobre contas/banco de produção. Publicação desta correção permanece pendente.
