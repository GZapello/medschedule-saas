# Login Google — configuração e validação

O Zemda utiliza o botão oficial Google Identity Services em modo popup, com uma
única inicialização e retorno por `credential` ao endpoint existente
`POST /api/v1/auth/google`. Não há redirecionamento do Zemda para `gsi/transform`.

## Produção

- Use o mesmo OAuth Client ID do tipo **Web application** em
  `VITE_GOOGLE_CLIENT_ID` (durante o build do frontend) e `GOOGLE_CLIENT_ID`
  (runtime do backend). Alterar a variável Vite exige reconstruir o frontend.
- Nas **Authorized JavaScript origins** desse cliente no Google Cloud, cadastre
  `https://zemda.com.br` e, se utilizado, `https://www.zemda.com.br`.
  Origens não incluem `/login`, `/cadastro` ou outros caminhos.
- Preserve no proxy/CDN os cabeçalhos emitidos pelo servidor:
  `Cross-Origin-Opener-Policy: same-origin-allow-popups` e
  `Referrer-Policy: strict-origin-when-cross-origin`.
- Se houver CSP no proxy, permita os recursos GIS conforme a documentação
  oficial; não adicione uma política global permissiva como correção.

O frontend exibe somente uma mensagem amigável em caso de falha. Detalhes de
Client ID ausente/inválido, script indisponível, credencial ausente e tentativa
sem retorno ficam no console ou nos logs internos. Erros `origin_mismatch` ou
`invalid_client` dentro do popup do Google exigem correção no Google Cloud;
essa janela é de outra origem e não pode ser inspecionada ou fechada pelo Zemda.
O botão não exige FedCM. Se o popup estiver bloqueado, o usuário deve permitir
popups para a origem e repetir a tentativa ou entrar com senha.

## Testes

`node frontend/tests/google-auth-browser.cjs` testa GIS simulado em Chromium,
Chrome e Edge instalados e Opera quando disponível. Usa uma origem HTTPS
interceptada: não equivale a um login real em produção nem valida o Google Cloud.
Inclui inicialização única, roteamento entre botões, falhas, novo usuário,
conta existente e vínculo por senha nos fluxos de login/cadastro.

`node backend/run-tests.cjs test-google-auth.cjs test-consents.cjs` usa banco
temporário e verificação Google simulada; não envia mensagens externas.

Após publicar e confirmar as origens, validar manualmente com uma conta de teste:
conta vinculada entra; conta local exige senha; novo usuário recebe nome/e-mail no
cadastro. Repetir em Chrome, Edge e Opera, incluindo popup bloqueado. Não registrar
tokens, senhas ou credenciais em logs.

Referências: [configuração GIS](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
e [API JavaScript](https://developers.google.com/identity/gsi/web/reference/js-reference).

## Revisão de 08/10/2026

O roteamento agora usa `state` por botão (API oficial GIS), com limpeza no unmount
 e descarte de respostas duplicadas. O consumidor recebe somente a string do token;
nome/e-mail no login e cadastro vêm da resposta verificada do backend. Não há leitura
do conteúdo de frames. Diagnósticos do frontend ficam restritos ao modo DEV e erros
públicos usam mensagens controladas, inclusive na submissão final do cadastro.

Analytics, Ads, navegação e atualização de consentimento toleram falhas do SDK,
inclusive getters que lançam erro. Os testes verificam cadastro sem senha até a
sessão autenticada, serialização do corpo HTTP, tracking quebrado, respostas atrasadas,
unmount, duplicação, tentativas simultâneas, timeout e nova tentativa. No backend,
o teste usa banco temporário para criar a conta Google, conferir verificação de e-mail,
etapa pending_plan e login subsequente; apenas a verificação criptográfica Google é simulada.

Builds frontend/backend e testes simulados passaram em Chromium, Chrome e Edge.
Opera não está instalado. Os assets públicos consultados ainda contêm a versão
anterior. Não houve deploy nem autenticação com conta Google real nesta revisão;
a causa exata do erro de produção toJSON/Window ainda precisa ser confirmada com
uma reprodução real. Os testes locais não satisfazem sozinhos o aceite em produção.
