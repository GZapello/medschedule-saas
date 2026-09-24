# Monitoramento de erros de produção

Antes deste monitoramento, um erro em produção só aparecia nos logs do Railway, e alguém precisava estar olhando.

Agora o servidor **envia um e-mail aos colaboradores** quando algo quebra. O envio usa o Resend, que o sistema já usa para os e-mails de verificação, então não há conta nova nem custo novo.

## O que gera alerta

| Origem | Exemplo | O que vai no e-mail |
|---|---|---|
| **Qualquer resposta HTTP 5xx** | um controller cai no `catch` e responde `500` | rota padronizada (`GET /api/v1/patients/:id`), status, mensagem de erro devolvida ao cliente, clínica (`tenant_id`) e usuário (`id`) |
| **Exceção no tratador central do Express** | erro lançado dentro de uma rota | tipo, mensagem e *stack trace* |
| **Jobs em segundo plano** | reconciliação de cobrança (Asaas), avisos de fim de teste, limpeza de cadastros, fila de lembretes, **falha de backup** | origem (`billing-reconciliation`, `backup`, ...), mensagem e *stack trace* |
| **Exceção não tratada / promise rejeitada sem `catch`** | bug que derrubaria o processo | mensagem e *stack trace*. O processo então é encerrado, como o Node já fazia, e o Railway reinicia o serviço |

Erros 4xx (validação, login inválido, sem permissão) **não** geram alerta: são comportamento esperado.

## O que NUNCA vai no e-mail

Não vão corpo da requisição, query string (que pode conter `?token=`), cabeçalhos, IDs presentes na URL (viram `:id`) e dados de pacientes.

A mensagem do erro e o *stack trace* vão, porque são necessários para corrigir o problema. Os alertas devem ir **só para quem já tem acesso administrativo ao sistema**.

Na mesma mudança, o log de requisições do servidor também deixou de gravar a query string. Antes, um `?token=<JWT>` de uma requisição com erro ficava registrado no log.

## Anti-spam

- **Agrupamento:** o mesmo erro (mesma rota e status, ou mesma exceção na mesma linha de código) gera **no máximo 1 e-mail a cada `ERROR_ALERT_THROTTLE_MINUTES`** (padrão: 30 min). O e-mail seguinte informa quantas vezes ele ocorreu nesse meio-tempo, por exemplo `(37x)` no assunto.
- **Teto global:** no máximo `ERROR_ALERT_MAX_PER_HOUR` e-mails por hora (padrão: 20), somando todos os erros. Isso protege a cota do Resend num incidente grande. O que ficar retido entra na contagem do próximo alerta.
- Se o Resend falhar, a aplicação segue normalmente. A falha é só registrada no log.

## Configuração (Railway → Variables)

| Variável | Valor |
|---|---|
| `ERROR_ALERT_EMAILS` | **Obrigatória para receber alertas.** E-mails separados por vírgula. Ex.: `pedro@exemplo.com, socio@exemplo.com` |
| `RESEND_API_KEY` | Já deve existir, pois é usada pelos e-mails de verificação |
| `EMAIL_FROM` | Opcional. Remetente (padrão: `Zemda <acesso@notify.zemda.com.br>`) |
| `ERROR_ALERT_THROTTLE_MINUTES` | Opcional. Padrão 30 |
| `ERROR_ALERT_MAX_PER_HOUR` | Opcional. Padrão 20 |

Sem `ERROR_ALERT_EMAILS`, nada é enviado, e o log mostra um aviso uma única vez: `ERROR_ALERT_EMAILS não definido`.

O assunto dos e-mails segue o formato `[Zemda][produção] HTTP 500 em POST /api/v1/appointments (3x)`. Vale criar um filtro no e-mail para destacá-los.

## Limitações e próximos passos

- **Erros no navegador** (tela branca, erro de JavaScript no React) **não** são capturados, só os do servidor. O próximo passo natural é um serviço dedicado como o [Sentry](https://sentry.io), que tem plano gratuito (limitado a 1 usuário) com agrupamento, painel e captura no frontend.
- O estado do agrupamento fica em memória: se o servidor reiniciar, a contagem recomeça.
- Não há monitoramento de **disponibilidade**, ou seja, alerta se o site inteiro sair do ar (se o servidor cai, ele não consegue avisar). Um monitor externo gratuito (UptimeRobot, Better Stack etc.) chamando `https://zemda.com.br/api/health` a cada 5 minutos resolve isso em poucos minutos de configuração.
- O teste `backend/test-error-monitor.cjs` (roda no CI) cobre: alerta em 5xx, ausência de dados sensíveis, agrupamento, teto por hora, falha do Resend e ausência de destinatários.
