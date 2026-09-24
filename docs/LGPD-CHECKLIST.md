# Checklist LGPD: Zemda

> **Isto não é parecer jurídico.** É um levantamento técnico do que o código faz hoje, com a evidência em `arquivo:linha`, comparado com os pontos da LGPD (Lei 13.709/2018) mais relevantes para um SaaS de saúde. Antes de tratar dados reais de pacientes em escala, revise com um advogado especializado em proteção de dados.
>
> Levantamento feito em 24/09/2026 sobre o código da branch `melhorias-infra`.

## Contexto que muda tudo

- **Dados de saúde são dados pessoais sensíveis** (art. 5º, II, e art. 11). O Zemda guarda prontuários, anamneses, avaliações psicológicas, fotos corporais, exames e prescrições. As exigências de segurança e a gravidade de um incidente são maiores que num SaaS comum.
- **Há dados de crianças e adolescentes** (`patients.is_child`, tabela `guardians`), com regras próprias (art. 14).
- **Dois papéis diferentes:**
  - Para os **dados dos pacientes**, a clínica é a **controladora** e o Zemda é **operador** (art. 5º, VII; art. 39). O Zemda age sob instrução da clínica, e a clínica precisa conseguir atender os pacientes dela, por exemplo exportando ou apagando dados.
  - Para os **dados dos clientes** (profissionais, clínicas, cobrança), o Zemda é **controlador**.
- A política de privacidade já descreve esses papéis (`frontend/src/components/public/PrivacyPolicyView.tsx:92-124`). É um bom ponto de partida.

**Legenda:**
- ✅ atende
- ⚠️ parcial / com ressalvas
- ❌ não atende

**Prioridade:**
- **P0**: corrigir antes de crescer a base de clientes (risco alto ou declaração falsa);
- **P1**: próximos 30–60 dias;
- **P2**: melhoria contínua.

---

## 1. Governança e documentação

| # | Item | Estado | Evidência / observação | Prioridade |
|---|---|---|---|---|
| 1.1 | Encarregado (DPO) com **identidade e contato públicos** (art. 41, §1º) | ⚠️ | Há só os e-mails `privacidade@` e `dpo@zemda.com.br` (`PrivacyPolicyView.tsx:280-286`), sem o nome do encarregado. Esses e-mails existem e alguém lê? | P1 |
| 1.2 | Política de privacidade **fiel ao que o sistema faz** | ❌ | Ela afirma quatro coisas que o sistema não faz. Veja o quadro abaixo desta tabela | **P0** |
| 1.3 | **Lista de suboperadores** na política e no contrato | ❌ | A política cita só hospedagem, Asaas e GA4 (`PrivacyPolicyView.tsx:198-203`). Faltam Google Gemini, Google (voz no navegador), Resend, Cloudflare R2, Meta/WhatsApp e Railway | **P0** |
| 1.4 | **Contrato de operador (DPA)** entre o Zemda e cada clínica: instruções, sigilo, suboperadores, devolução/eliminação no fim do contrato, cooperação em incidentes | ❌ | Não há documento específico. Não verifiquei se os Termos de Uso cobrem isso | P1 |
| 1.5 | **Registro das operações de tratamento** (ROPA, art. 37) | ❌ | Não existe. Os dados de saúde estão espalhados em cerca de 150 tabelas | P1 |
| 1.6 | **Relatório de Impacto (RIPD)**, recomendado para dados sensíveis em larga escala (art. 38) | ❌ | Não existe | P2 |
| 1.7 | **Plano de resposta a incidentes**: comunicar ANPD e titulares em até **3 dias úteis** (art. 48; Resolução CD/ANPD nº 15/2024) | ❌ | Nenhum documento ou procedimento. Veja a seção 9 | **P0** |

**Quadro 1.2: afirmações da política de privacidade que não correspondem ao sistema**

| O que a política afirma | Onde | O que acontece de fato |
|---|---|---|
| "Criptografia de ponta a ponta" | `PrivacyPolicyView.tsx:200` | Não existe. Há TLS no transporte, e o banco é um arquivo em texto claro |
| "Backups programados automatizados" | `PrivacyPolicyView.tsx:230` | Não existiam. Passam a existir quando a branch for para produção (`docs/BACKUP.md`) |
| "Logs de auditoria imutáveis" de **todos** os acessos a prontuários | `PrivacyPolicyView.tsx:142` | Muitas leituras não são registradas (seção 6), e o log pode ser apagado |
| IA faz "processamento efêmero para formatação de texto" | `PrivacyPolicyView.tsx:145` | O chat envia o prontuário inteiro, com CPF (seção 3) |

## 2. Bases legais e consentimento

| # | Item | Estado | Evidência / observação | Prioridade |
|---|---|---|---|---|
| 2.1 | Registro do aceite de termos e política, com versão, data, IP e user-agent | ✅ | `legal_acceptances` (`schema.sql:615-628`), gravado em `auth.controller.ts:536-548`. Novo aceite é pedido quando a versão muda (`CURRENT_TERMS_VERSION`, `database.ts:20`) | — |
| 2.2 | Base legal para dados de saúde: tutela da saúde (art. 11, II, "f") | ⚠️ | É a base adequada para o atendimento. Deve estar explícita na política e no DPA | P1 |
| 2.3 | **Crianças: autorização do responsável** (art. 14) | ❌ | `guardians.authorization_signed` é **sempre gravado como 1**: `g.authorizationSigned ? 1 : 1` (`patient.controller.ts:225`), valor fixo no update (`:357`) e no agendamento público. O sistema registra uma autorização que nunca foi coletada. Mesmo que a base seja a tutela da saúde (Enunciado CD/ANPD nº 1/2023), um registro inverídico é um problema | **P0** |
| 2.4 | TCLE / consentimentos clínicos com assinatura, CPF, IP e hash | ✅ | `patient_consents` (`patient-clinical.controller.ts:803-830`) | — |
| 2.5 | **Revogação** de consentimento (art. 8º, §5º) | ❌ | Não há rota para revogar `patient_consents` (`routes/index.ts:710-711`) | P1 |
| 2.6 | Cookies e analytics só com consentimento | ⚠️ | O Meta Pixel está bem restrito (consentimento, páginas públicas, sem query string; `metaPixel.ts`). O GA4 usa Consent Mode com tudo `denied` por padrão, mas o `gtag.js` carrega em **todas** as páginas, inclusive no app logado, e `gtag('config', …)` roda sem `send_page_view: false` (`frontend/index.html:39-42`). A visualização automática de página envia a URL completa, e há rotas com token no caminho (`/convite/:clinica/:token`, `/verificar-documento/:token`) | P1 |
| 2.7 | Aviso de privacidade no **agendamento público** (paciente sem conta) | ❌ | `POST /v1/public/appointments` coleta nome, telefone e e-mail sem apresentar aviso ou link da política | P1 |

## 3. IA, transferência internacional e suboperadores

| # | Item | Estado | Evidência / observação | Prioridade |
|---|---|---|---|---|
| 3.1 | **Minimização no envio ao Google Gemini** | ❌ | O chat de IA monta o contexto com **nome, telefone, e-mail, CPF**, contato de emergência, observações administrativas, alergias, medicamentos, até 10 evoluções, exames e anamneses completas (`ai.controller.ts:1358-1440`). Resumos e relatórios mandam o nome do paciente (`gemini.service.ts:250, 298`). Não há pseudonimização. **Primeiro passo simples:** tirar CPF, telefone, e-mail e contato de emergência do contexto, porque a IA não precisa deles, e trocar o nome por "Paciente" | **P0** |
| 3.2 | Chave do Gemini em **plano pago** | ❓ | No plano gratuito da API, os termos do Google permitem usar o conteúdo para melhorar produtos, inclusive com revisão humana. **Confirme no console do Google** que a conta é paga | **P0** (verificar) |
| 3.3 | **Opção por clínica** para ligar/desligar a IA, com aviso ao profissional | ❌ | Não existe (busca por `ai_enabled`, `allow_ai`, `ai_consent` sem resultado). Hoje só o RBAC limita o acesso | P1 |
| 3.4 | Ditado por voz (`webkitSpeechRecognition`) | ⚠️ | No Chrome, o áudio da consulta é processado nos servidores do Google (`frontend/src/hooks/useSpeechRecognition.ts`). Nada informa isso ao usuário | P1 |
| 3.5 | Lembretes por WhatsApp e e-mail | ⚠️ | A mensagem leva o **nome do serviço** (`notification.service.ts:105-110`). "Psicoterapia", por exemplo, revela condição de saúde a quem vê a tela do celular. Considere um texto genérico, como "sua consulta" | P2 |
| 3.6 | Asaas (pagamentos) | ✅ | Recebe só dados da clínica (`billing.service.ts:90-95`), não de pacientes | — |
| 3.7 | Transferência internacional com mecanismo do art. 33 (cláusulas-padrão, Resolução CD/ANPD nº 19/2024) documentado para cada suboperador fora do Brasil | ❌ | Não documentado | P1 |

## 4. Direitos dos titulares (art. 18)

| # | Item | Estado | Evidência / observação | Prioridade |
|---|---|---|---|---|
| 4.1 | **Acesso e portabilidade**: a clínica consegue exportar todos os dados de um paciente | ❌ | Não existe. Há só exportação CSV de agendamentos e pagamentos (`report.controller.ts:118-153`) e impressão de um prontuário | P1 |
| 4.2 | Correção | ✅ | `PUT /v1/patients/:id`. Ressalva: os responsáveis são apagados e reinseridos a cada edição, e o histórico se perde (`patient.controller.ts:354`) | — |
| 4.3 | **Eliminação / anonimização / bloqueio de paciente** | ❌ | Não há `DELETE /v1/patients/:id` (`routes/index.ts:253-256`). Só é possível inativar (`active = 0`). O prontuário precisa ser guardado por **20 anos** (Lei 13.787/2018, art. 6º). Por isso a resposta certa costuma ser **bloquear e anonimizar o cadastro, mantendo o prontuário pelo prazo legal**, e não apagar | P1 |
| 4.4 | **Exclusão de clínica** preservando o que a lei exige | ❌ | O expurgo (`clinic-control.service.ts:127-145`) apaga **toda tabela com `tenant_id`**, inclusive `audit_logs` e `legal_acceptances`, que são a prova de consentimento e de acesso. Também não há **exportação/devolução dos dados antes** do expurgo nem regra para os 20 anos de prontuário. Isso contradiz a própria política (`PrivacyPolicyView.tsx:213`) | P1 |
| 4.5 | Clínica pede o encerramento e os dados dela sozinha | ❌ | Só o superadmin exclui (`tenant.controller.ts:764-817`) | P2 |
| 4.6 | Canal para o titular exercer direitos, com prazo de resposta | ⚠️ | Existe o e-mail `privacidade@`. Não há procedimento interno nem prazo definido | P2 |

## 5. Segurança da informação (art. 46)

| # | Item | Estado | Evidência / observação | Prioridade |
|---|---|---|---|---|
| 5.1 | Segredos fora do código e sem valores padrão | ✅ | Corrigido em `e77ee71`. O servidor não sobe sem `JWT_SECRET` e `ZEMDA_FILES_SIGNING_SECRET`. O backdoor `admin.middleware.ts` foi removido | — |
| 5.2 | Contas padrão com senha conhecida | ✅ | Só existem com `SEED_DEMO_DATA=true` (`seed.ts`). Nunca ligar em produção | — |
| 5.3 | CORS restrito, cabeçalhos de segurança (helmet), rate limiting | ✅ | `server.ts`. O login tem limite de 20 tentativas a cada 15 min por IP | — |
| 5.4 | **Backup criptografado e testado** | ✅* | *Nesta branch (`docs/BACKUP.md`). Só vale depois do deploy e de configurar `BACKUP_ENCRYPTION_KEY` + R2 | **P0** (ativar) |
| 5.5 | **Monitoramento de erros** | ✅* | *Nesta branch (`docs/MONITORAMENTO.md`). Requer `ERROR_ALERT_EMAILS` | **P0** (ativar) |
| 5.6 | Política de senha | ❌ | Mínimo de **6 caracteres**, sem mais regras (`auth.controller.ts:746, 993, 1257`; `free-trial.controller.ts:403`). Para quem acessa prontuários, recomenda-se **mínimo de 10–12 caracteres** e checagem contra senhas vazadas | P1 |
| 5.7 | **Segundo fator (2FA)** para administradores e profissionais | ❌ | Não existe | P1 |
| 5.8 | Trocar ou redefinir a senha **derruba as outras sessões** | ❌ | `session_version` é por clínica e só muda quando a clínica é bloqueada (`tenant.controller.ts:701`). Um token roubado continua válido por até 7 dias | P1 |
| 5.9 | **Controle de acesso a arquivos** (anexos clínicos) | ❌ | O download e a exclusão de anexos não verificam o perfil: a recepção consegue baixar e **apagar de vez** exames e fotos clínicas, sem auditoria (`file.controller.ts:694-730`) | **P0** |
| 5.10 | JWT fora da URL | ⚠️ | A impressão do prontuário abre `?token=<JWT>` (`ClinicalRecordsView.tsx:180-182`), que fica no histórico do navegador. O log do servidor **deixou de gravar query string** nesta branch (`server.ts`) | P1 |
| 5.11 | Token no navegador e CSP | ⚠️ | O JWT fica em `localStorage` (`AuthContext.tsx:99`), e o CSP está desligado (`server.ts`). Um XSS teria acesso total à sessão | P2 |
| 5.12 | Rascunhos clínicos no navegador apagados no logout | ❌ | O autosave grava rascunhos de prontuário em `localStorage` (`useClinicalAutosave.ts:156`, `PsychologyWorkspace.tsx:260`), e o logout não limpa (`AuthContext.tsx:126-130`). Isso é um risco em computador compartilhado de clínica | P1 |
| 5.13 | Isolamento entre clínicas | ⚠️ | Existe só na aplicação: cada consulta precisa lembrar de filtrar `tenant_id`. O `tenant.middleware.ts` confere o cabeçalho contra o JWT, o que é bom. O superadmin pode ler cadastros (com CPF) de qualquer clínica sem registro de auditoria | P2 |
| 5.14 | Criptografia em repouso do banco | ❌ | O SQLite é um arquivo em texto claro no volume do Railway (só os tokens do WhatsApp são cifrados). Os backups externos passam a ser cifrados | P2 |

## 6. Rastreabilidade (trilha de auditoria)

| # | Item | Estado | Evidência / observação | Prioridade |
|---|---|---|---|---|
| 6.1 | Log de escritas (criar, editar, excluir) | ✅ | Cerca de 130 tipos de ação via `logAudit` (`audit.middleware.ts`), com IP e user-agent | — |
| 6.2 | **Log de leituras de dados sensíveis** | ⚠️ | Há registro de prontuário (`VIEW_CLINICAL_RECORDS`), linha do tempo, odontograma e avaliações corporais. **Não** há de: cadastro com CPF (`GET /patients/:id`), anamnese, exames, alergias, **download de arquivos**, exportações CSV/DOCX e dados enviados à IA | P1 |
| 6.3 | Falhas de login registradas | ❌ | Só o login com sucesso é registrado (`auth.controller.ts:142`) | P1 |
| 6.4 | A clínica (controladora) consulta a própria trilha | ❌ | A consulta é exclusiva do superadmin (`routes/index.ts`) | P2 |
| 6.5 | Trilha íntegra e à prova de adulteração, com retenção definida | ❌ | Não é imutável e é apagada no expurgo da clínica (item 4.4). O IP vem do `x-forwarded-for` bruto, que pode ser forjado; o correto é usar `req.ip`, já que `trust proxy` está ligado | P2 |
| 6.6 | Gravação de auditoria em `taxonomy.controller.ts:506` | ⚠️ | Usa colunas (`old_values`/`new_values`) que não existem no schema, então provavelmente falha sem aviso | P2 |

## 7. Retenção e descarte

| # | Item | Estado | Evidência / observação | Prioridade |
|---|---|---|---|---|
| 7.1 | Cadastros abandonados são expurgados | ✅ | `registration-cleanup.service.ts` expurga clínicas pendentes há mais de 5 dias, sem pagamento nem uso | — |
| 7.2 | Anonimização de colaboradores desligados | ⚠️ | Acontece 30 dias depois da desativação, mas **só quando alguém abre a lista de equipe** (`staff.controller.ts:19-61`), não por agendamento | P2 |
| 7.3 | Política de retenção para tabelas técnicas | ❌ | Nada é limpo em `email_verifications` (com IP), `notifications.content`, `ai_conversations` (histórico de chat com dados clínicos), `asaas_webhook_events.payload` e `audit_logs` | P2 |
| 7.4 | Política de retenção **documentada** (quanto tempo, por quê, o que acontece depois) | ❌ | — | P1 |

## 8. Dados pessoais em logs

| # | Item | Estado | Evidência / observação | Prioridade |
|---|---|---|---|---|
| 8.1 | Query string (tokens) fora dos logs | ✅ | Corrigido nesta branch (`server.ts`) | — |
| 8.2 | Alertas de erro sem dados pessoais | ✅ | Os alertas não levam corpo, query string, cabeçalhos nem IDs da URL (`docs/MONITORAMENTO.md`) | — |
| 8.3 | E-mail e telefone de pacientes nos logs | ⚠️ | `notification.service.ts:26, 35, 43` registram o destinatário do lembrete. Mascare, por exemplo `p***@gmail.com` | P2 |

## 9. Incidentes de segurança

| # | Item | Estado | Evidência / observação | Prioridade |
|---|---|---|---|---|
| 9.1 | Detecção | ⚠️ | Os alertas de erro por e-mail entram nesta branch. Não há alerta de comportamento suspeito, como muitos downloads ou acessos fora do padrão | P2 |
| 9.2 | **Plano de resposta escrito** | ❌ | Veja o roteiro mínimo abaixo | **P0** |
| 9.3 | Capacidade de **restaurar** após incidente (ransomware, exclusão) | ✅* | *Com o backup ativado (5.4) e testado mensalmente | **P0** (ativar) |

**Roteiro mínimo de resposta a incidente.** Transforme isto num documento de uma página:

1. **Conter:** trocar os segredos afetados (`JWT_SECRET` derruba todas as sessões), bloquear contas e revogar chaves de API.
2. **Avaliar:** o que vazou, de quais clínicas e titulares, desde quando. A trilha de auditoria e os logs do Railway ajudam.
3. **Comunicar:**
   - O Zemda, como operador, avisa **as clínicas afetadas** imediatamente.
   - A controladora comunica **a ANPD e os titulares em até 3 dias úteis** quando houver risco ou dano relevante (Resolução CD/ANPD nº 15/2024). Dados de saúde e de crianças costumam se enquadrar nisso.
4. **Registrar** o incidente, mesmo se não for comunicado: a norma exige manter registro.
5. **Corrigir** a causa raiz e revisar este checklist.

---

## Ordem sugerida de ataque

1. **Esta semana (P0 rápidos, sem desenvolvimento pesado):**
   - ativar backup e alertas em produção (5.4, 5.5, 9.3);
   - confirmar que o Gemini é plano pago (3.2);
   - corrigir a política de privacidade: tirar "ponta a ponta", "imutáveis" e "efêmero" e listar os suboperadores (1.2, 1.3);
   - escrever o plano de incidente (1.7, 9.2).
2. **P0 de código:**
   - tirar CPF, telefone, e-mail e contato de emergência do contexto da IA e pseudonimizar o nome (3.1);
   - parar de gravar `authorization_signed = 1` sem coleta real (2.3);
   - exigir perfil clínico para baixar e apagar anexos clínicos, com auditoria (5.9).
3. **P1:**
   - exportação de dados por paciente e por clínica (4.1);
   - bloqueio/anonimização de paciente respeitando os 20 anos (4.3);
   - expurgo de clínica que preserve auditoria e aceites e entregue os dados antes (4.4);
   - 2FA e política de senha (5.6, 5.7);
   - derrubar sessões ao trocar a senha (5.8);
   - auditoria de leituras e falhas de login (6.2, 6.3);
   - DPA com as clínicas (1.4) e ROPA (1.5).
4. **P2:** o restante, como melhoria contínua.

## Já resolvido nas últimas mudanças

- Segredos hardcoded e backdoor removidos; o servidor falha se os segredos não estiverem configurados.
- Contas com senha padrão não são mais criadas em produção.
- CORS restrito, helmet e rate limiting.
- Backup automático criptografado com cópia fora do Railway (nesta branch).
- Alerta de erros de produção por e-mail, sem dados pessoais (nesta branch).
- Query string (com `?token=`) fora dos logs do servidor (nesta branch).
