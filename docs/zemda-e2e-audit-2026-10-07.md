# Auditoria funcional E2E do Zemda — 07/10/2026

Base: `c61ae26`, árvore inicialmente limpa. Ambiente local Windows, Chromium/Playwright existente, frontend e backend compilados. Bancos e usuários sintéticos isolados. Nenhuma alteração ou execução da auditoria contra produção; nenhum envio real de mensagens. Após a validação local, o usuário autorizou commit, push e deploy no Railway. O resultado da publicação é informado separadamente dos resultados locais abaixo.

## Execuções e evidências

| Verificação | Baseline anterior às mudanças | Reexecução final |
| --- | --- | --- |
| Build backend | Aprovado | Aprovado |
| Build frontend | Aprovado | Aprovado; aviso existente de chunks acima de 500 kB |
| `npm run test:e2e` | 12 aprovados, 10 falhas / 22 | 48/48 aprovados, 4,3 minutos; zero falhas ou ignorados |
| `npm run test:e2e:critical` | 4 aprovados, 5 falhas / 9 | 29/29 aprovados, 2,8 minutos |
| Backend determinístico | 66 aprovadas, 10 falhas / 76 suítes de arquivo | 77/77 aprovadas; após as últimas correções de orçamento, 3/3 suítes afetadas reexecutadas e aprovadas |

Os números backend contam arquivos de suíte, não assertions individuais. `test-gemini-multimodal.cjs` é um teste manual de provedor real e foi excluído; testes de IA simulada continuam incluídos. A primeira reexecução backend aprovou 76/76, antes de adicionar a regressão de estoque. A reexecução E2E intermediária aprovou 42/45, revelando mais três problemas corrigidos em seguida. A execução dirigida posterior aprovou 10/11; a falha restante revelou o retorno indevido de sucesso de orçamento, também corrigido. Esses resultados intermediários não substituem a validação final.

Uma reexecução adicional teve 46/47 aprovados e uma falha ambiental pelo SDK Google externo. Após isolar esse SDK, cadastro, relatórios e nove seções de configurações passaram juntos em 3/3 cenários. Evidências em `%TEMP%/zemda-audit-e2e-google-network-failure.log` e `%TEMP%/zemda-audit-google-isolation.log`.

A rodada crítica que reproduziu a reabertura das boas-vindas aprovou 27/28 e falhou na consulta Fisio por modal interceptando cliques após descarte. Evidência em `%TEMP%/zemda-audit-welcome-repro.log`. Foi adicionada uma regressão de descarte permanente e recarga antes das execuções finais de 48 cenários totais / 29 críticos.

Logs locais em `%TEMP%`: `zemda-audit-e2e-baseline.log`, `zemda-audit-critical-baseline.log`, `zemda-audit-backend-baseline.log`, `zemda-audit-e2e-final-complete.log`, `zemda-audit-critical-final.log`, `zemda-audit-last-fixes.log`, `zemda-audit-signup-security.log`, `zemda-audit-backend-final-77.log`, `zemda-audit-budget-conversion-repro.log` e `zemda-audit-budget-final.log`. O relatório Playwright fica em `playwright-report/index.html`; falhas retêm screenshot e trace. O acompanhamento Fisio gera e anexa um PDF real ao relatório. A última execução Playwright substitui o HTML anterior.

## Bugs reproduzidos e correções

| Prioridade | Problema / causa raiz | Correção e regressão |
| --- | --- | --- |
| P1 | Finalização compartilhada não solicitava `saveOnly`, encerrando o atendimento antes da etapa financeira. | Hook solicita salvamento clínico, aguarda confirmação do backend e então abre recebimento. Testes verificam atendimento ainda em andamento antes do pagamento e concluído depois. |
| P1 | Med, Psico e PP tinham handlers antigos que não respeitavam a etapa compartilhada; callbacks antecipados desmontavam o módulo. | Handlers delegam ao fluxo global; callbacks ocorrem após conclusão financeira. Testes UI nos três módulos e backend verificam prontuário, lacre, pagamento e repetição sem duplicatas. |
| P1 | Fechar pagamento para continuar depois podia perder o estado de conclusão clínica. | Estado salvo preservado: repetir Finalizar reabre recebimento sem salvar outra evolução. Teste Fisio usa Continuar depois, reabre e conclui como pendente. |
| P2 | URLs diretas de Fono, TO, Nutri e PP resolviam identificadores incompatíveis com a renderização. | Aliases alinhados no App. Roundtrips acessam URL direta e recarregam antes de finalizar. |
| P2 | Autosave Psico ignorava digitação inicial durante uma janela artificial de 600 ms. | Removido atraso; efeito aguarda carregamento real. Evolução digitada logo após abrir persiste após F5. |
| P2 | Plano alimentar explícito podia salvar antes do draft; F5 restaurava draft anterior vazio. | Aguardar flush do autosave antes de salvar plano. Regressão inclui alimento manual, edição, totais e exclusão. TACO/TBCA preservada. |
| P2 | PP recebia envelope `{ patient }` e tratava como paciente direto. | Normalização do retorno; teste verifica identificação do aprendente e finalização após F5. |
| P2 | Cadastro consultava rota protegida de áreas de atuação antes da autenticação/ativação, produzindo 401/402 antes do fallback público. | Usar diretamente a taxonomia pública existente. Regressão de cadastro UI monitora navegador e HTTP durante todo o onboarding. |
| P2 | Impressão de acompanhamento incluía script síncrono do CDN Tailwind antes do conteúdo. Lentidão externa deixava popup sem `.a4-page`. | Reutilizar CSS da aplicação já carregado, mantendo classes e estilos de impressão. Regressão verifica paciente/clínica no popup e gera PDF real. |
| P2 | Resposta/temporizador pendente do onboarding podia reabrir boas-vindas depois do descarte permanente, bloqueando atendimento. | Invalidar carregamentos anteriores ao persistir preferência e cancelar temporizador no cleanup. Novo E2E verifica preferência persistida, navegação e F5; consulta Fisio também reproduziu o bloqueio antes da correção. |
| P2 | Avaliações compartilhadas de paciente novo podiam consultar histórico antes de estabelecer o vínculo de atendimento. | Resolver/reutilizar contexto autorizado antes da consulta. Nutri e outros módulos passam com paciente sintético novo; autorização backend preservada. |
| P2 | Atualização de fotos Personal mantinha tipos removidos e não distinguia campo omitido de array vazio. | Transação/savepoint, validação prévia, remoção seletiva. Testes cobrem omissão preservando, exclusão parcial, array vazio e repetição. |
| P1 | Saída de estoque acima do saldo recebia 201 e zerava saldo artificialmente. | Validar quantidade positiva/finita e disponibilidade; retornar 409 se insuficiente. Transação reúne saldo, movimento e auditoria. Nova suíte reproduziu 201 antes da correção e verifica rollback forçando erro no INSERT. |
| P2 | Alteração de estoque e status de orçamento retornavam sucesso quando nenhum registro da clínica era afetado. | Retornar 404 para ID ausente/estrangeiro. Teste A/B verifica negativa e preservação do registro original. Os UPDATEs já continham filtro de clínica; a evidência foi de resposta falsa, não de escrita cruzada. |
| P1 | Conversão de orçamento aceitava `referenceId` de item de estoque de outra clínica e atualizava saldo sem filtro de tenant. | Reproduzido retorno 200 com referência externa. Validar todos os itens antes de escrever, filtrar leitura/escrita por clínica e converter dentro de transação. Regressão verifica rejeição 404, preservação do saldo externo, conversão própria, repetição e rollback quando o histórico falha. |
| P1 | Criação de orçamento aceitava paciente de outra clínica e JOIN de detalhes/listagem expunha seu cadastro. | Reprodução local retornou 201 e nome do paciente externo. Criação exige paciente da clínica; JOIN também filtra tenant para proteger vínculos legados inválidos. Teste A/B cobre a tentativa de criação. |

Arquivos de produto: `frontend/src/components/clinical/useConsultationCompletion.tsx`, `frontend/src/components/clinical/PatientFollowUpDocumentModal.tsx`, `frontend/src/components/auth/CreateClinicModal.tsx`, `frontend/src/components/onboarding/OnboardingContext.tsx`, `frontend/src/App.tsx`, workspaces Med/Psico/PP/Nutri, `frontend/src/shared/clinical-assessments/ClinicalAssessmentsPanel.tsx`; controllers backend documents, medical, psychology, psychopedagogy, personal, inventory e budget.

Não houve redesign, migração produtiva ou expansão de módulos. As pequenas melhorias são os retornos explícitos 404/409 e a preservação do recebimento pendente: permitem ao usuário distinguir falha de conclusão e impedem inconsistência de estoque.

## Infraestrutura e testes corrigidos

- Helper de login sincroniza onboarding e navegação explícita; seletores antigos de confirmação e estoque estético atualizados para a UI existente.
- Agendamento público usa sua fixture própria na porta 4177, com projetos desktop, tablet e celular; módulos clínicos usam 4175.
- Fixtures corrigidas para e-mails únicos, profissionais ativos, vínculo de responsável, schedules e serviços. Testes de mudança de profissão respeitam autorização do próprio profissional; a proteção não foi relaxada para fazer testes passarem.
- Monitor dos novos testes positivos captura `pageerror`, `console.error`, HTTP inesperado e falhas de rede da aplicação. Negativas API têm assertions explícitas; não se exige ausência de 4xx quando o teste provoca acesso proibido.
- Cleanup do runner verifica caminho dentro do temporário do sistema e prefixo de teste, com tentativas limitadas para `ENOTEMPTY` no Windows. Uma reexecução foi interrompida por esse erro de ambiente antes da correção.
- Fixtures de onboarding usam OTP sintético e armazenamento simulado; nenhuma credencial externa real. Não foram adicionados `skip`, `fixme`, `only`, cliques forçados ou esperas arbitrárias.
- Uma rodada adicional revelou dependência de rede do SDK Google Identity: atraso/falha do script externo gerou timeout em Configurações e `console.error`. A fixture agora responde ao SDK na fronteira externa; não simula login, APIs clínicas ou persistência. O teste de OAuth Google continua fora da cobertura e não se atribui aprovação a ele.
- Fontes Google remotas recebem CSS vazio na fixture, usando fallback nativo, para que navegações funcionais não dependam desse provedor. A aparência específica dessas fontes não foi validada. Uma rodada foi interrompida após reproduzir a falha do PDF para corrigir o produto e recompilar antes da reexecução; não é contabilizada como aprovada.
- Scripts e chamadas de telemetria Google também são respondidos localmente na fronteira dos testes de navegador. A fixture não valida entrega real de analytics. A rodada interrompida registrou ainda modal de conexão no Psico, sem comprovação de bug clínico; esse mesmo caminho passou nas execuções finais sem dependências externas.
- Após corrigir o PDF, a rodada dirigida aprovou 8/9: o PDF e Psico passaram, mas Med teve `net::ERR_NETWORK_CHANGED` em dezenas de assets servidos por localhost. Trata-se de falha de rede do navegador/ambiente, preservada pelo monitor, e não foi ocultada com whitelist ou retry automático. Log `%TEMP%/zemda-audit-print-final.log`.
- O usuário confirmou que houve troca/reconexão de rede durante a auditoria, corroborando a causa ambiental dos `ERR_NETWORK_CHANGED`. As execuções afetadas permanecem registradas como falhas/interrupções, sem serem contadas como aprovação.

## Matriz de cobertura do pedido

“Backend” abaixo inclui suites de API/controladores e algumas verificações estruturais existentes; não significa interação completa pela interface.

| Seções do pedido | Evidência executada / alcance |
| --- | --- |
| 1–4, 54–57 | Infraestrutura existente, baseline antes de mudar código, bancos temporários, monitor de erros e grupo `@critical` ampliado. |
| 5, 53 | Landing em três viewports: título, descrição, canonical, imagens, links legais e abertura do cadastro; agendamento público também em três viewports. |
| 6–7 | Cadastro/onboarding API e novo caminho completo UI, OTP simulado, teste grátis, perfil profissional e consulta dos horários padrão. |
| 8–10 | Login real dos perfis usados; suites backend de invalidação de sessão, permissões e convites administrativos/profissionais. |
| 11–14, 43 | Dashboard de entrada; criação UI de paciente e serviço; agendamento UI com profissional/serviço/horário e consulta após F5. Infraestrutura de salas/conflitos em suites backend. |
| 15–16, 19–20 | Atendimento Fisio pela Agenda, módulos por URL direta, prontuário e pagamento compartilhado. Backend de consultas, permissões, estoque clínico e cobrança. |
| 17–18, 35 | Acompanhamento Fisio pela UI, popup de impressão A4 e PDF real; suites backend de acompanhamento global, logotipo, documentos e acesso a arquivos. |
| 21 | Suites de orçamentos e permissões; nova tentativa A/B de leitura/alteração de status. Não é um CRUD UI completo de todos os tipos de orçamento. |
| 22 | Estoque UI 100 → saída 20 → 80 e F5; API de quantidade inválida, saldo insuficiente e rollback transacional. |
| 23 | CRUD estético de avaliação, plano, procedimento com produto/consumo, fotos, evolução e retorno; F5, isolamento A/B e finalização. Negativa de erro não abre pagamento. |
| 24–25 | Odonto: roundtrip UI com prontuário/lacre/pagamento; suites de odontograma, orçamento, estoque e implantes. Implantes não recebeu uma rodada UI integral própria. |
| 26–28 | Fono, Fisio e TO: evolução, autosave/F5 e finalização real; suites específicas de audiologia, postura e avaliações. |
| 29 | Nutri: roundtrip clínico e alimento manual com edição, totais e exclusão; busca TACO permanece visível. |
| 30–31 | Psico e PP: evolução, autosave/F5, identificação, lacre, recebimento e prontuário; suites clínicas específicas. |
| 32 | Personal: aluno e avaliação pela UI com F5; cálculos, postura, fotos e relatórios em backend. |
| 33–34 | Med: roundtrip UI e suites de especialidades; Zemda360 em suites backend de estrutura, nomenclatura e avaliações regionais. |
| 36–39 | Suites backend de exames/arquivos, consentimentos, WhatsApp manual e lembretes; provedores simulados, sem mensagens reais. |
| 40–42 | Abertura UI das nove seções da Central de Configurações com monitor de erros; profissão, especialidades, visibilidade e limites em backend. |
| 44 | Relatórios UI, downloads CSV de atendimento/financeiro e validação de conteúdo. |
| 45–46 | Clínica B não lista/lê/altera registros A; pacientes, atendimento, prontuário, avaliação, consentimento, estoque e orçamento. Suites de RBAC, arquivos, direitos dos pacientes, sessão e minimização de IA. |
| 47 | Suites backend de superadmin, exclusão segura de clínica, consentimentos e limpeza de trial; nenhuma exclusão em produção. |
| 48–49 | Agendamento público em três viewports; profissional multimódulo em suites de resolução/transição/visibilidade. |
| 50–52 | F5 e consulta API após escrita nos roundtrips; negativas de acesso, validação e finalização; repetição sem segundo prontuário/pagamento em testes backend/UI selecionados. |
| 58–61 | Correções extras reproduzidas, regressões, builds e resultados documentados neste relatório. |

## Reprodução local

Para reproduzir a validação local na raiz do repositório (PowerShell):

```powershell
npm --prefix backend run build
npm --prefix frontend run build
$auditTests = Get-ChildItem backend -Filter 'test-*.cjs' -File | Where-Object Name -ne 'test-gemini-multimodal.cjs' | Select-Object -ExpandProperty Name
node backend/run-tests.cjs @auditTests
npm run test:e2e:critical
npm run test:e2e
```

## Limitações e riscos restantes

Esta execução não comprova todos os botões e todos os campos secundários das 61 seções. Algumas áreas têm apenas cobertura backend/estrutural, como indicado na matriz. Instrumentos clínicos individuais, todos os cenários de agenda/salas, todos os formulários de superadmin e configurações não foram percorridos integralmente na UI. Os cenários novos priorizaram finalização, persistência, pagamento, estoque e isolamento; não foi criada uma matriz UI de cada instrumento clínico. A responsividade em três viewports foi verificada na landing e no agendamento público; os módulos clínicos não receberam a mesma matriz completa. É uma limitação de cobertura, não uma aprovação implícita.

Provedores reais de WhatsApp/e-mail/IA, armazenamento R2 remoto, OAuth externo, certificado ICP e impressão física não são validados por simulações locais. O PDF de acompanhamento comprova renderização/conteúdo básico, não revisão visual de cada documento possível. Não foi realizado pentest independente. O aviso de bundle frontend acima de 500 kB permanece; é risco de desempenho, sem falha de build observada.

O roundtrip estético executou em aproximadamente 51–58 segundos e mantém seu timeout próprio existente de 240 segundos. Os demais cenários usam o limite global de 60 segundos. A dependência externa do SDK foi removida da fixture após causar timeout; máquinas lentas ainda podem afetar a duração dos cenários. Não foram adicionadas tentativas automáticas para mascarar falhas.

A auditoria acima foi executada localmente. A publicação posterior no Railway foi autorizada pelo usuário; os testes locais não comprovam, por si só, configuração ou saúde desse ambiente.
