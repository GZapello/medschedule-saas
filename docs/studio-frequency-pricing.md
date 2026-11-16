# Preços por frequência semanal — Studio

A configuração é opcional e fica no accordion de cobrança do serviço. O botão aparece a partir de dois encontros elegíveis da grade. São contados encontros, incluindo vários horários no mesmo dia, sem limitar a sete.

## Aplicação

- **Por aula:** o preço da frequência contratada substitui o valor unitário no cálculo existente de quatro semanas, média anual ou calendário real.
- **Por período:** aplica o total exato da tabela da periodicidade financeira, sem multiplicar novamente pelo número de aulas. Mensal, bimestral, trimestral, semestral, anual e bienal possuem tabelas próprias.
- Frequências sem valor preenchido usam o cálculo automático para a quantidade contratada. Desativar a opção preserva os valores e restaura a cobrança padrão.
- Ao reduzir a grade, os valores excedentes permanecem salvos e recebem um aviso, mas não são oferecidos para novas contratações.
- Novas contratações internas e públicas com cadência semanal usam os horários reais da grade. O servidor recalcula o preço e os snapshots financeiros, sem confiar no valor enviado pelo navegador.
- O fluxo público permite selecionar os encontros da grade e mantém a validação de disponibilidade existente. As aulas cobertas ficam vinculadas ao plano e não geram pagamentos avulsos. Reservas repetidas ou planos com vigências sobrepostas são bloqueados quando necessário para evitar duplicação.
- Contratos e cobranças anteriores mantêm seus snapshots. Perfis que não são Studio e fluxos sem a opção ativa conservam a cobrança anterior.

## Persistência

Uma única coluna opcional `services.frequency_pricing_json`, adicionada pela migração existente. Configuração versionada, com modalidade, ativação e tabelas em centavos inteiros positivos. Consultas e atualizações são limitadas ao estabelecimento.

## Arquivos desta implementação

Frontend:

- `frontend/src/components/services/ServiceFrequencyPricingPanel.tsx` — painel e tabelas dinâmicas.
- `frontend/src/components/services/ServiceBillingConfigPanel.tsx` — integração com cobrança e resumo.
- `frontend/src/components/services/ServicesView.tsx` — cadastro, edição e persistência.
- `frontend/src/components/services/NewServiceModal.tsx` — cadastro rápido e edição.
- `frontend/src/components/services/StudioServicePresentation.tsx` — resumo do accordion e lateral.
- `frontend/src/components/calendar/NewAppointmentModal.tsx` — preço da contratação interna.
- `frontend/src/components/public-booking/StudioPublicBookingFlow.tsx` — seleção pública e resumo.
- `frontend/src/utils/studioFrequencyPricing.ts` — configuração e encontros elegíveis.
- `frontend/src/utils/studioPricing.ts` — extensão opcional do cálculo existente.
- `frontend/src/types/index.ts` — configuração no tipo do serviço.

Backend:

- `backend/src/config/studio-improvements.migration.ts` — coluna opcional.
- `backend/src/controllers/service.controller.ts` — validação, gravação e leitura.
- `backend/src/controllers/tenant.controller.ts` — configuração no catálogo público.
- `backend/src/controllers/appointment.controller.ts` — horários enviados ao cálculo interno.
- `backend/src/controllers/package.controller.ts` — integração do agendamento público de serviços.
- `backend/src/services/frequency-pricing.service.ts` — cotação autoritativa pela grade.
- `backend/src/services/billing-cycle.service.ts` — criação dos snapshots e cobertura.
- `backend/src/utils/studio-frequency-pricing.ts` — validação e contagem de encontros.
- `backend/src/utils/studio-pricing.ts` — extensão opcional do cálculo existente.
- `backend/src/utils/establishment-context.ts` — frequência de referência acima de sete quando a opção está ativa.

Testes adicionados:

- `backend/test-studio-frequency-pricing.cjs`
- `frontend/tests/studio-frequency-pricing.tsx`
- `frontend/tests/studio-frequency-pricing-browser.cjs`

## Validação

- Builds TypeScript/Vite do frontend e TypeScript do backend.
- `node test-studio-frequency-pricing.cjs`: 53 verificações aprovadas, incluindo seis periodicidades, duas unidades, três regras de cálculo, encontros no mesmo dia, isolamento, HTTP de contratação interna e pública, snapshots e ausência de pagamentos avulsos.
- `node test-studio-service-billing.cjs`: 38 verificações de regressão aprovadas, executadas com banco temporário isolado.
- `node tests/studio-frequency-pricing-browser.cjs`: desktop de 1440 px e mobile de 390 px; grades de 1, 2, 3, 7 e 9 encontros, unidades, ativação, redução da grade, paridade frontend/backend, seleção pública e edição real no accordion com payload em centavos.
- `node tests/studio-service-presentation-browser.cjs`: regressão dos formulários, dez modalidades de cobrança, grades, outros perfis e responsividade.
- `npm run test:exercise-protection`: 10 verificações aprovadas.
- `git diff --check`: sem problemas.

Não foi realizado deploy. As alterações anteriores do modal de pacotes foram preservadas.
