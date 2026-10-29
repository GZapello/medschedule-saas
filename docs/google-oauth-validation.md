# Google OAuth — implantação e validação

Estas alterações são locais. Não configuram o projeto Cloud, não publicam a política e não constituem aprovação Google. Não executar operações com pacientes reais para demonstrar a integração.

## Configuração antes da implantação

- Confirmar no Google Cloud que o cliente web pertence ao projeto `zemda-508910` e que a Calendar API está habilitada.
- Configurar `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` e `GOOGLE_CALENDAR_REDIRECT_URI=https://zemda.com.br/api/v1/integrations/google-calendar/callback` no gerenciador de segredos. Não colocar credenciais no repositório.
- Configurar `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` com um segredo aleatório dedicado de pelo menos 32 bytes. A integração não usa mais fallback automático para JWT nem chave fixa.
- Se houver tokens existentes, preservar a chave que os criptografou: informar temporariamente `GOOGLE_CALENDAR_PREVIOUS_ENCRYPTION_KEYS` como array JSON de chaves antigas no ambiente protegido. Não executar rotação sem backup e sem confirmar qual chave foi usada. Se a chave anterior não puder ser recuperada, será necessário desconectar e autorizar novamente.
- Após compilar e aplicar as migrações aditivas em ambiente controlado, executar `node dist/scripts/rotate-google-calendar-key.js` para conferir a decifragem; depois `node dist/scripts/rotate-google-calendar-key.js --apply` para recriptografar. O script não imprime tokens nem chaves. Retirar as chaves anteriores somente depois da validação e considerar a recuperação de backups antigos.
- As migrações preservam registros e adicionam identidade Google, verificador PKCE, token de canal, erro de sincronização e marca de origem do horário. Conexões antigas sem identidade estável exigem desconexão antes de uma nova autorização; atendimentos e eventos Google são preservados.
- Executar uma instância responsável pela sincronização com este banco SQLite. A serialização de operações e o agendador são por processo; múltiplas réplicas exigem coordenação distribuída antes de habilitar workers concorrentes.
- Liberar POST HTTPS público para `/api/v1/integrations/google-calendar/webhook`, sem redirecionar para login. O receptor valida canal, recurso, expiração e token. O processo renova os canais e tenta sincronizar a cada cinco minutos.
- Conferir URL pública da política, domínio autorizado, identidade visual, suporte, escopos e situação de publicação no Console. Publicar a versão 2026.2 da política junto ao código e revisar os termos contratados do Gemini, retenção de logs/backups e solicitações de exclusão. O código não comprova essas condições de infraestrutura/provedor.

## Escopos do aplicativo

`openid`, `email`, `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/calendar.calendarlist.readonly`, `https://www.googleapis.com/auth/calendar.freebusy`.

Não são solicitadas permissões Gmail, Drive ou Meet REST. Meet é criado por `conferenceData` na Calendar API. Transcrições são coladas pelo profissional; não são baixadas do Google.

## Roteiro com conta de teste — pendente de execução real

1. Entrar com usuário profissional em clínica de teste e abrir Configurações → Google Agenda e Meet. Usar dados fictícios.
2. Conectar Google; conferir aplicativo, projeto/cliente, redirect e todas as permissões. Testar cancelamento, permissão parcial, callback repetido e autorização expirada. Não gravar credenciais no vídeo.
3. A conexão nova começa pausada. Selecionar agenda, configurar período/direção/privacidade, ativar e salvar. Verificar conta identificada após recarregar.
4. Criar atendimento futuro, sincronizar e conferir título sem paciente por padrão, horário e ausência de conteúdo clínico. Alterar horário e cancelar; verificar no Google. Repetir sincronização para garantir ausência de duplicatas.
5. Criar compromisso externo no Google; conferir bloqueio no Zemda. Simular indisponibilidade Google: a consulta de slots deve informar erro, sem considerar os horários livres.
6. Criar consulta online sem link; confirmar Meet. Transformar consulta presencial em online; verificar geração do link. Conferir geração assíncrona/pending, calendário sem suporte e preservação de link manual.
7. Alterar evento vinculado no Google; aguardar notificação ou clicar Sincronizar agora. Conferir divergência, aplicar o horário respeitando escala/conflitos, ou manter Zemda. Testar offsets, exclusão e eventos sem horário. Eventos pessoais não viram atendimentos automaticamente.
8. Testar as três direções e pausa. Uma divergência não deve ser sobrescrita por sincronização automática. Somente o proprietário da conexão pode resolvê-la.
9. Testar dois usuários e duas clínicas: status, preferências, divergências e tokens devem permanecer isolados. Repetir reconexão com outra conta Google.
10. Desconectar: confirmar remoção local, preservação de atendimentos/eventos e revogação Google. Se a revogação remota falhar, seguir o aviso para revogar manualmente em `https://myaccount.google.com/permissions`. A revogação pode atingir outras concessões da mesma conta ao mesmo aplicativo.
11. Colar transcrição fictícia do Meet, confirmar informação/autorização do paciente e organizar com IA. Conferir remoção de identificadores conhecidos, revisão antes de aplicar e ausência de salvamento automático da transcrição bruta. Texto livre não tem garantia de anonimização integral.
12. Registrar vídeo do consentimento e de cada funcionalidade associada aos escopos; conferir o checklist específico recebido da equipe Google antes de enviar.

## Checks locais

- Backend: `npm run build`; `node run-tests.cjs test-google-calendar-integration.cjs test-google-calendar-security.cjs test-teleconsultation.cjs` (bancos temporários e transporte Google simulado).
- Frontend: `npm run build`; `node tests/google-calendar-settings-browser.cjs` (API simulada; 320, 360, 375, 390, 412, 430, 768 e 1440 px).
- Os projetos não possuem script de lint. Os builds incluem verificação TypeScript.
- Esses checks não comprovam consentimento, notificações, FreeBusy, Meet, revogação ou configuração real de produção.

## Arquivos envolvidos

- Backend: `src/services/google-calendar.service.ts`, `src/controllers/google-calendar.controller.ts`, `src/utils/google-calendar-crypto.ts`, `src/config/google-calendar.migration.ts`, `src/config/database.ts`, `src/server.ts`.
- Disponibilidade e IA: `backend/src/controllers/slot.controller.ts`, `backend/src/controllers/professional.controller.ts`, `backend/src/controllers/ai.controller.ts`.
- Frontend: `src/components/settings/GoogleCalendarSettings.tsx`, `src/components/settings/SettingsView.tsx`, `src/hooks/useGoogleCalendarStatus.ts`, `src/components/calendar/CalendarView.tsx`, `src/components/clinical/TeleconsultationTranscriptModal.tsx`, `src/components/public/PrivacyPolicyView.tsx`.
- Rotação: `backend/src/scripts/rotate-google-calendar-key.ts`.
- Testes: `backend/test-google-calendar-security.cjs`, `backend/test-google-calendar-integration.cjs`, `backend/test-teleconsultation.cjs`, `frontend/tests/google-calendar-settings.tsx`, `frontend/tests/google-calendar-settings-browser.cjs`.

A versão 2026.2 aciona o fluxo existente de novo aceite da política. Backups e retenção no provedor Gemini precisam ser confirmados pelo responsável antes da publicação.

## Resultado da execução local

- Builds de backend e frontend: aprovados; TypeScript sem erros. O Vite mantém aviso de chunks acima de 500 kB.
- Backend: 3/3 arquivos de teste aprovados (integração Google, segurança Google e teleconsulta), incluindo os 11 casos da suíte original.
- Painel Google: teste de navegador aprovado nas oito larguras e nas ações salvar/sincronizar/desconectar; screenshots de 320 e 1440 px inspecionadas.
- `git diff --check`: aprovado.
- Regressão visual ampla `frontend/tests/teleconsultation-browser.cjs`: não aprovada. Depois de atualizar o texto de consentimento e corrigir seletores obsoletos do modal, parou por timeout na busca de “Configurar teleconsulta” no cenário `source=agenda&online` (linha 54). Não confundir esse teste com o teste aprovado do painel Google. É necessário revisar esse cenário antes de considerar toda a teleconsulta validada.
- Nenhum fluxo real com Google, Console, provedor Gemini ou infraestrutura de produção foi validado. Nenhuma rotação de chave ou migração foi executada no banco real.
