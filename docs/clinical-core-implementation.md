# Evolução estrutural clínica — relatório de implementação

Data: 01/10/2026. Trabalho no checkout atual da `main`, preservando commits e alterações locais. Nenhum commit ou push realizado nesta implementação. O diff também contém trabalho simultâneo de cadastro/onboarding e nomenclatura; o inventário abaixo não atribui essas alterações a esta implementação.

## 1. Arquivos alterados

Principais alterações desta implementação:

- `frontend/src/hooks/useClinicalAutosave.ts`: debounce estável, isolamento de contexto, recuperação e resolução de conflitos.
- `frontend/src/components/clinical/ClinicalDraftRecoveryModal.tsx`: uma escolha resolve o conflito uma única vez.
- `frontend/src/components/clinical/ClinicalQuickHeaderActions.tsx`: carregamento explícito de dados clínicos históricos.
- `frontend/src/components/clinical/{FinishConsultationModal,QuickConsultationModal,useConsultationCompletion}.tsx`: revisão compartilhada e EVA.
- Workspaces de fisioterapia, nutrição, fonoaudiologia, terapia ocupacional, odontologia, medicina, psicologia, psicopedagogia e estética: integração ao core, neutralidade ou finalização.
- `frontend/src/components/physiotherapy/RegionalPhysioAssessmentModal.tsx`: EVA compartilhada.
- `frontend/src/components/medical/specialties/SpecialtyFieldComponents.tsx`: campos compartilhados.
- `frontend/src/components/dashboard/DashboardView.tsx` e `backend/src/controllers/dashboard.controller.ts`: rotina diária e escopo por perfil.
- `frontend/src/components/superadmin/SystemIntegrityView.tsx`, rotas e `backend/src/services/error-monitor.service.ts`: indicadores técnicos.
- `.github/workflows/ci.yml`, `.gitignore`, `backend/run-tests.cjs` e testes de regressão: verificação obrigatória sem exclusões de falhas conhecidas.
- Correções encontradas pelos testes: serviços de exclusão de clínicas, limpeza de cadastros, R2, transição de profissão, migração de notificações e SQL do controlador de IA. Exclusões respeitam vínculos e transação; falhas de armazenamento mantêm limpeza pendente para nova tentativa.
- Ajuste pontual na resposta de cadastro para refletir verificação de e-mail e período de teste efetivamente persistidos, preservando o novo onboarding.

## 2. Arquivos criados

- `frontend/src/components/clinical/ClinicalPainScale.tsx`
- `frontend/src/components/clinical/ClinicalFields.tsx`
- `frontend/src/components/clinical/useClinicalReview.tsx`
- `frontend/src/components/dentistry/forms/PeriodontalExamForm.tsx`
- `frontend/src/components/dashboard/TodayWorklist.tsx`
- `frontend/test-clinical-core.cjs`
- `backend/src/services/dashboard-worklist.service.ts`
- `backend/src/services/system-integrity.service.ts`
- `backend/src/controllers/system-integrity.controller.ts`
- `backend/test-system-integrity.cjs`
- `backend/test-fixtures/verified-email.cjs`
- `package.json`, `package-lock.json`, `playwright.config.ts` e árvore `e2e/`.
- Este relatório.

## 3. Clinical Core

O diretório clínico reúne escala de dor, campos neutros, booleano de três estados, revisão e renderização do registro. Os hooks existentes continuam responsáveis por reset, contexto do paciente e autosave. Não foi criado outro modelo de prontuário nem outra árvore de permissões.

EVA usa range 0–10, passo 1, estado inicial “Não avaliado”, seleção explícita de zero e limpeza para não avaliado. O valor segue os mesmos campos de persistência, histórico e impressão existentes.

## 4. Workspaces refatorados

O exame periodontal foi extraído de DentistryWorkspace com responsabilidade própria. A lógica repetida de revisão e EVA foi centralizada. Fisio, Nutri, Fono e TO carregam histórico nos formulários somente por ação explícita; recuperar rascunho continua automático. Estética passou a usar autosave compartilhado e o modal real de finalização, mantendo o workspace montado ao voltar para editar. Não houve fragmentação indiscriminada dos demais workspaces.

## 5. Reutilização

Reutilizados `ClinicalBooleanSelect`, `useClinicalFormReset`, `ClinicalSnapshot`, `ClinicalDraftRecoveryModal`, `ClinicalAutosaveIndicator`, `useClinicalAutosave`, `useConsultationCompletion`, `FinishConsultationModal`, fluxo de pagamento e prontuário universal. Os novos campos são `ClinicalSelect`, `ClinicalTextarea`, `ClinicalNumberInput` e `ClinicalPainScale`.

Mantidos os mecanismos existentes de profissão → especialidade → área → capability, `hasCapability`, `validateModuleAccess` e concessão de acesso ao Zemda360. Nenhuma capability paralela ou avaliação duplicada foi criada. Identificadores legados necessários à compatibilidade permanecem internos.

## 6. Resumo antes da finalização

O resumo usa uma cópia do estado atual, mostra identificação e conteúdo preenchido e não cria registros para a prévia. “Voltar e editar” cancela a escrita mantendo os dados. A confirmação aciona os serviços atuais de salvamento/finalização e pagamento. O filtro preserva zero e falso explícitos e omite valores não avaliados e linhas de catálogo sem resultado. A mudança de paciente invalida uma confirmação pendente.

## 7. Dashboard Hoje

O dashboard atual mostra agenda do dia, contadores e ações existentes, atendimentos em andamento, rascunhos autorizados, exames aguardados, retornos registrados e alergias efetivamente cadastradas. Profissionais têm escopo próprio; resumo financeiro é restrito ao gestor. Não foram inventadas pendências de documentos sem estado persistido. Retornos utilizam agendamentos marcados como consulta de retorno.

## 8. E2E

Playwright na raiz, com `fixtures`, `helpers` e pastas auth, onboarding, agenda, dashboard, clinical, odonto, personal, zemda360, superadmin e integrity. Banco SQLite temporário e contas sintéticas; e-mail e armazenamento externos isolados.

Cobertura inclui login real pela interface; Dashboard → atendimento → preenchimento neutro/EVA → autosave → troca de aba → revisão/cancelamento/confirmação → prontuário/status; recuperação após reload; conflitos local/servidor; troca de paciente; estética com revisão; cadastro/OTP/onboarding; convite de funcionário; agenda; orçamento odontológico e exclusão; persistência Zemda360; RBAC e privacidade da telemetria. Parte dos cenários usa a API real pelo Playwright; não são todos fluxos visuais. Personal tem cobertura E2E de proteção de acesso, complementada pelos testes backend funcionais.

## 9. CI

Typecheck e build de ambos os projetos, todos os testes backend, três testes frontend e E2E. Removida a lista de falhas toleradas do runner. Qualquer processo de teste que falhe produz saída não zero. Traces de falhas são artefatos de CI. A configuração de proteção de branches/deploy no provedor remoto depende das configurações do repositório e não foi alterada localmente.

## 10. Integridade e observabilidade

Endpoint exclusivo de SuperAdmin, bloqueado em sessão sandbox. Eventos técnicos agregados por hora, rota Express parametrizada, módulo, status e clínica; sem corpo de requisição, URL concreta, diagnóstico, imagem, documento, senha ou token. Janela de 24 horas, retenção de sete dias, limpeza com limite e páginas de 25 linhas. Mostra APIs, autosave, uploads, WhatsApp, filas existentes e clínicas afetadas. Webhooks reutilizam estados persistidos; notificações e exclusões não possuem estado independente de execução. Versão/ambiente são sanitizados; horário do processo não é apresentado como horário confirmado de deploy.

## 11–12. Builds e testes

- Backend: `npm run build` e `npx tsc --noEmit` concluídos com código zero.
- Frontend: `npm run build` e `npx tsc --noEmit` concluídos com código zero; zero erros TypeScript.
- Backend: 59 arquivos de testes validados. A última bateria completa passou 58/59; o teste de integridade restante tinha a lista esperada fora da ordem alfabética. Corrigida apenas a ordem, a reexecução desse teste passou 1/1. Os três erros anteriores de cadastro/cobrança/serviço também passaram na bateria completa.
- Frontend: os três scripts `test-clinical-neutral-defaults.cjs`, `test-medical-specialties.cjs` e `test-clinical-core.cjs` passaram.
- E2E: 17 cenários validados. A última bateria passou 16/17; após corrigir a leitura da resposta de agendamento, o cenário Estetic restante passou 1/1, incluindo confirmação e persistência no prontuário.
- Não há testes dispensados ou marcados como falhas aceitas; as reexecuções acima são registradas explicitamente, sem apresentar as baterias iniciais como totalmente verdes.

## 13. Limites e pendências técnicas

- Vite continua alertando sobre chunks acima de 500 kB; o build conclui, mas há oportunidade de divisão adicional.
- Status e horário exatos do último deploy não estão disponíveis sem integração do provedor; nenhuma credencial foi exposta.
- Estados de documentos/encaminhamentos ausentes do modelo atual não foram inventados.
- O E2E visual completo cobre o fluxo clínico Fisio e revisão Estetic; não equivale a validação visual exaustiva de todas as especialidades ou PDFs.
- Serviços externos reais (pagamento, WhatsApp, R2) requerem validação em ambiente de integração próprio; a bateria local usa dados e provedores de teste.
- A CI foi configurada e seus comandos executados localmente; não houve envio ao GitHub nem execução remota nesta tarefa.
