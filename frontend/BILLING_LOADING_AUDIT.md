# Zemda — transições de billing sem tela de assinatura transitória

## Causa e correção

O App tratava ausência de resposta de billing como recusa financeira. Ao invalidar a consulta no login/troca de clínica, renderizava `BillingView` antes de conhecer o direito de acesso.

`useBillingSummary()` agora expõe `summary`, `loading`, `status`, `error` e `reload`. Os estados são `idle`, `loading`, `loaded` e `error`. A resposta deve possuir `canOperate` booleano; resposta inválida é erro de consulta, sem suposição financeira.

- Login/restauração e mudança de identidade: snapshot anterior indisponível imediatamente, tela neutra **Carregando Zemda...**, seguida do ambiente ou da regularização após resposta válida.
- Erro de consulta: operação fechada, mensagem **Não foi possível verificar sua assinatura agora.**, botão **Tentar novamente**, sem planos/preços/checkout.
- Resposta válida negando acesso: mantém a tela **Assinatura e Plano** e todas as proteções financeiras existentes.
- Refresh da mesma identidade: mantém o ambiente já montado durante a consulta. Recusa ou erro recebido encerra a operação na interface. A API continua validando cada requisição.
- Respostas atrasadas: continuam protegidas pela chave usuário/clínica e sequência de requisições. Nenhum armazenamento persistente é usado para conceder acesso financeiro.

## Troca de clínica e sessão

Foi mantido `window.location.assign('/dashboard')` após a troca. É a opção segura para descartar estados em memória dos módulos clínicos. O AuthContext entra em loading antes de alterar a clínica usada pelas requisições e libera o estado anterior se a troca falhar. No fluxo SuperAdmin, encerra loading após carregar a nova clínica.

`reloadSession()` não aciona loading global para a mesma identidade. Após sucesso, solicita refresh silencioso do billing. Assim, o listener existente de foco não desmonta Dashboard durante uma atualização bem-sucedida.

`login()` e `loginWithToken()` limpam o tenant anterior quando a nova autenticação não fornece objeto de clínica, evitando reutilização de contexto antigo.

## Arquivos

- `src/components/billing/BillingView.tsx`: estados explícitos, consulta silenciosa, isolamento por identidade e tratamento de erro/carregamento na própria tela de assinatura.
- `src/components/billing/BillingAccessStatus.tsx`: loader neutro e erro com retry.
- `src/App.tsx`: carregamento/erro separados da recusa financeira confirmada.
- `src/context/AuthContext.tsx`: isolamento durante troca, limpeza no login e refresh silencioso.
- `tests/billing-loading.cjs`: novos cenários com App e AuthContext reais.
- `tests/billing-access.cjs`: regressões ajustadas para os estados de carregamento e erro.
- `package.json`: `test:billing` executa ambas as suítes; `test:billing:loading` executa a nova isoladamente.

Nenhum código de backend ou regra de entitlement foi alterado nesta correção.

## Validação

- `npm run build --prefix frontend`: aprovado, TypeScript e Vite. Aviso de bundles grandes já existente.
- `node frontend/tests/billing-access.cjs`: **45 casos aprovados**, mantendo bloqueio operacional, expiração, checkout pago e visualização administrativa.
- `node frontend/tests/billing-loading.cjs`: **13 cenários aprovados**, com tráfego externo bloqueado e API simulada, usando AuthContext/App/hook reais.
- `git diff --check`: aprovado.

Os 13 cenários cobrem TRIAL e ACTIVE com respostas imediatas, 150 ms e 3 s; reload; login por senha e token (mesmo caminho de aplicação do login Google); logout/login; A → B → A com ambas válidas e com B sem assinatura; erro 500; payload inválido; retry; recuperação de foco mantendo o mesmo nó de Dashboard; recusa financeira após refresh.

Um observador das transições do DOM verifica que a tela de assinatura não apareceu no caminho de acesso válido. As condições lentas são simuladas por atraso da consulta de billing; não são uma medição de operadora ou de largura de banda 3G real. Não foram usadas credenciais de pacientes nem contas de produção nos testes.

Evidências locais, ignoradas pelo Git: `test-results/billing-loading-build.log`, `billing-loading-regression.log`, `billing-loading.log`, `billing-loading/results.json`, `billing-loading/loading.png` e `billing-loading/error.png`.

## Publicação

Entrega pelo fluxo existente: commit na `main` do GitHub, deploy automático no Railway e conferência do status do deploy, arquivos publicados e endpoint de saúde. O resultado da publicação é confirmado no chat após a execução.
