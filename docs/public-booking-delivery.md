# Entrega — Agendamento público Zemda

Implementação local, concluída em 02/10/2026. Sem commit, push ou publicação. Alterações pré-existentes de autenticação foram preservadas.

## 1. Arquivos desta implementação

- [backend/src/config/database.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/backend/src/config/database.ts)
- [backend/src/config/schema.sql](C:/Users/gabri/OneDrive/Documents/antigravity-projects/backend/src/config/schema.sql)
- [backend/src/config/slug-migration.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/backend/src/config/slug-migration.ts)
- [backend/src/controllers/tenant.controller.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/backend/src/controllers/tenant.controller.ts)
- [backend/src/controllers/professional.controller.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/backend/src/controllers/professional.controller.ts)
- [backend/src/controllers/appointment.controller.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/backend/src/controllers/appointment.controller.ts)
- [backend/src/controllers/slot.controller.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/backend/src/controllers/slot.controller.ts)
- [backend/src/utils/slug.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/backend/src/utils/slug.ts)
- [backend/src/utils/slot-calculator.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/backend/src/utils/slot-calculator.ts)
- [backend/src/utils/public-booking.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/backend/src/utils/public-booking.ts)
- [frontend/src/App.tsx](C:/Users/gabri/OneDrive/Documents/antigravity-projects/frontend/src/App.tsx)
- [frontend/src/components/public-booking/PublicBookingView.tsx](C:/Users/gabri/OneDrive/Documents/antigravity-projects/frontend/src/components/public-booking/PublicBookingView.tsx)
- [frontend/src/components/public-booking/PublicProfessionalBookingView.tsx](C:/Users/gabri/OneDrive/Documents/antigravity-projects/frontend/src/components/public-booking/PublicProfessionalBookingView.tsx)
- [frontend/src/components/public-booking/PublicBookingShell.tsx](C:/Users/gabri/OneDrive/Documents/antigravity-projects/frontend/src/components/public-booking/PublicBookingShell.tsx)
- [frontend/src/components/public-booking/BookingLinkSettings.tsx](C:/Users/gabri/OneDrive/Documents/antigravity-projects/frontend/src/components/public-booking/BookingLinkSettings.tsx)
- [frontend/src/components/settings/SettingsView.tsx](C:/Users/gabri/OneDrive/Documents/antigravity-projects/frontend/src/components/settings/SettingsView.tsx)
- [frontend/src/components/professionals/ProfessionalsView.tsx](C:/Users/gabri/OneDrive/Documents/antigravity-projects/frontend/src/components/professionals/ProfessionalsView.tsx)
- [frontend/src/types/index.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/frontend/src/types/index.ts)
- [frontend/src/utils/publicBooking.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/frontend/src/utils/publicBooking.ts)
- [backend/test-public-booking.cjs](C:/Users/gabri/OneDrive/Documents/antigravity-projects/backend/test-public-booking.cjs)
- [e2e/public-booking.config.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/e2e/public-booking.config.ts)
- [e2e/specs/public-booking.spec.ts](C:/Users/gabri/OneDrive/Documents/antigravity-projects/e2e/specs/public-booking.spec.ts)

## 2. Componentes compartilhados

A página individual agora é uma variante do PublicBookingView existente, com profissional fixo. PublicBookingShell, BookingStepIndicator, BookingEmptyState, BookingSkeleton e BookingBackButton compartilham o visual público. BookingLinkCard, ClinicBookingSettings e ProfessionalBookingSettings padronizam os controles internos. Não foram duplicadas rotas de API.

## 3. Banco

Campos do tenant: public_booking_enabled (INTEGER, DEFAULT 0), public_booking_slug (TEXT) e public_booking_sequence (INTEGER). Índice único composto para slug e sequência. Migração idempotente no fluxo de migrações existente. A migração não altera tenant.slug nem reescreve slugs existentes de profissionais. Novos tenants recebem identidade de agendamento ao carregar suas configurações.

## 4–5. URL e duplicidade

Formato: https://zemda.com.br/agendar/clinica/{slug}. O link exibido usa o domínio atual da aplicação.

Exemplo para três clínicas de nome Clínica Psicom:

- /agendar/clinica/clinica-psicom
- /agendar/clinica/clinica-psicom/2
- /agendar/clinica/clinica-psicom/3

A sequência é alocada por slug e preservada. O namespace da clínica é interpretado antes das rotas individuais, evitando interpretar a sequência como professionalSlug. A URL não usa UUID.

## 6–7. Toggles e permissões

Configurações da Clínica agora contêm Agendamento Online, com ativação, cópia e visualização. O default de clínicas existentes é desativado. Página, horários e criação de agendamentos verificam o estado da clínica.

ProfessionalsView e SettingsView usam o mesmo card para a página individual. O administrador pode habilitar/desabilitar. O profissional pode consultar seu próprio link, sem alterar o toggle. O backend também exige clinic_admin para alterar publicBookingEnabled.

Os controles são independentes: desativar a página da clínica não desativa um link individual habilitado. Profissionais inativos ou com link desativado ficam fora do catálogo público da clínica e não aceitam reservas públicas.

## 8. Fluxo

Especialidade/área → Profissional → Data → Horário → Dados → Confirmação. Áreas vêm das profissões, especialidades, áreas de atuação e serviços reais. O filtro usa os vínculos reais entre profissional e serviço. Um único profissional com um único atendimento avança para data, mantendo seu nome visível; quando há vários serviços, o paciente escolhe o atendimento vinculado antes de avançar.

O link individual começa com o profissional fixo e permite selecionar atendimento/modalidade, quando aplicável. A confirmação mostra área, profissional, serviço, data, horário, modalidade e clínica; permite exportar calendário e iniciar novo agendamento.

## 9. Sem horário e conflitos

A tela oferece escolher outra data, outro profissional ou voltar às especialidades. No link individual, o paciente pode escolher outra data/atendimento. Erros temporários oferecem tentativa novamente. Um conflito limpa o horário escolhido e retorna à seleção de horários.

Disponibilidade reutiliza os calculadores existentes, considerando escalas, pausas, bloqueios, agendamentos e duração específica do profissional. A criação revalida o slot e a modalidade no servidor, rejeita serviços incompatíveis e ocorre em transação síncrona. A resposta de sucesso só é enviada após commit.

## 10. Voltar

Os botões públicos voltam apenas uma etapa. Nenhum botão do link individual envia para a landing. O App não limpa o agendamento para forçar a home. popstate sincroniza as rotas; o histórico nativo permanece disponível. A prévia interna autenticada conserva retorno explícito ao painel.

## 11. Visual

Logo oficial Zemda discreto no rodapé; clínica no cabeçalho com seu logo/nome/localidade; tipografia existente; teal institucional; fundo claro; cards brancos, bordas suaves e sombras discretas. Indicador responsivo, horários com alvos de toque, labels, foco visível, mensagens de erro e skeletons. Capturas de desktop, tablet e mobile foram inspecionadas; o indicador mobile foi ajustado após essa revisão.

## 12. Compatibilidade e segurança

Preservados /agendar/:clinicSlug/:professionalSlug e o legado /agendar/:professionalSlug. /c/:clinicSlug também resolve a página da clínica, respeitando seu toggle. Refresh direto nas URLs foi testado.

Os perfis públicos usam seleção explícita de dados: não retornam e-mails privados da clínica, tenant_id do profissional, permissões, prontuários ou dados financeiros. O endpoint público de criação não aceita patientId, internalNotes, convênios, encaminhamentos ou sala enviados pelo visitante. Conflitos públicos não revelam detalhes de outros atendimentos.

## 13. Testes e builds

- npm run build em backend: passou.
- npm run build em frontend: passou; aviso de tamanho de bundle, sem erro.
- node backend/test-public-booking.cjs: passou. Banco temporário; migração/default/duplicidade; flags; RBAC; dados públicos; vínculos; duração personalizada; pausas/bloqueios; reservas; conflitos; concorrência; rollback; links legados e independência dos toggles.
- npx playwright test --config=e2e/public-booking.config.ts: 12/12 passaram, nos tamanhos desktop 1440, tablet 768 e mobile 390. Fluxo completo com API local, filtros, único/múltiplos profissionais, vazio, navegação, páginas desativadas, sequências /2 e /3, refresh, confirmação e recuperação de conflito. O conflito visual usa resposta controlada; o conflito real é validado na integração backend.
- node backend/test-schedule-profession-change.cjs: 27 verificações passaram.
- git diff --check nos arquivos desta implementação: passou.

Os testes usam dados sintéticos e não abrem o banco da aplicação. A fixture isola a regra externa de cobrança; não usa gateways nem entrega notificações a destinatários reais. Não foi publicado ou ativado agendamento em clínicas reais nesta tarefa.
