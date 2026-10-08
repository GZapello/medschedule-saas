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

O frontend mostra erro de Client ID ausente/inválido, script indisponível,
credencial ausente e tentativa sem retorno. Erros `origin_mismatch` ou
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
