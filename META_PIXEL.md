# Meta Pixel — Zemda

Dataset: `1146672904351523` (identificador público, não segredo).

## Arquitetura e escopo

A aplicação usa React 18/StrictMode e roteamento manual por estado/history. O backend injeta conteúdo SEO no index via preRender; não hidrata React. O Pixel fica em `frontend/src/utils/metaPixel.ts`, acionado por useLayoutEffect em AppContent após a resolução da autenticação. Não há snippet global no index nem noscript incondicional, pois ambos poderiam contornar consentimento e exclusões de telas privadas.

Somente PageView, navegador, sem CAPI, advanced matching ou parâmetros de usuário. autoConfig é desabilitado antes da única chamada init. Não configurar eventos automáticos, correspondência avançada ou outro instalador deste Pixel via Meta/GTM sem revisão: isso pode mudar o escopo ou duplicar eventos.

A categoria marketing do consentimento existente foi habilitada, separada do Analytics. Consentimentos antigos com marketing=false continuam sem autorização. O visitante pode rever a escolha nas preferências de cookies. Recusa/revogação impede disparos futuros; não desfaz visitas já enviadas. O script, se já carregado, permanece na memória até recarregar a página, com consentimento revogado nas telas excluídas.

## Proteção e limitações deliberadas

Só funciona em HTTPS zemda.com.br/www.zemda.com.br, nas 15 rotas institucionais enumeradas. Exclui sessão autenticada, carregamento de autenticação, login/cadastro mesmo quando exibidos em `/`, convites, teste por token, verificação de documentos e agendamento de pacientes. O código não recebe conteúdo de formulários, dados de usuário ou dados clínicos.

O SDK lê URL/referrer por conta própria. Por isso URLs com qualquer query (inclusive UTM/fbclid) e fragmentos não reconhecidos ficam excluídas. Referrer com caminho privado ou query também bloqueia o documento. Não se alteram URLs para rastrear. Essa proteção reduz cobertura/atribuição de campanhas com parâmetros; revisar estratégia antes de lançar campanhas. Somente âncoras públicas conhecidas são permitidas. Meta ainda recebe metadados normais de rede/navegador, inclusive IP; não se promete anonimato.

## PageView e deduplicação

Inicializa uma vez por documento, após carregar o SDK e rever consentimento/contexto. Não enfileira PageViews durante o download. Cada mudança de página pública gera um PageView; renderizações repetidas, StrictMode e reautorizar na mesma página não repetem o evento. Voltar a uma página após outra tela é nova visita. Reload inicia um novo documento e gera nova visita. Nenhum evento adicional é implementado. Um instalador externo preexistente faz esta integração deixar de inicializar; instaladores adicionados depois precisam ser removidos para evitar duplicação externa.

## Validação

- `npm run build` em frontend: TypeScript + Vite aprovados; aviso já existente sobre tamanho de bundle.
- `node tests/meta-pixel-browser.cjs`: 18 verificações no navegador, SDK simulado, sem contaminar o dataset.
- `node tests/meta-pixel-app-browser.cjs`: bundle de produção da aplicação, consentimento e exclusão de login em memória, sem exceções JS.
- `node tests/landing-seo.cjs`: 15 rotas públicas, canonical/H1/meta, links e 404 aprovados.

Os testes de navegador usam Playwright disponível no ambiente via PLAYWRIGHT_MODULE e Chrome via CHROME_PATH, sem dependências novas no projeto. Executar a partir de frontend. A verificação local confirma as chamadas ao SDK, não a recepção real pela Meta.

## Teste após publicação

No Meta Events Manager selecione o dataset 1146672904351523 e a área Testar eventos/Test Events. Abra https://zemda.com.br sem parâmetros, deslogado e sem bloqueador de anúncios. Autorize marketing em Preferências de Cookies (ou Aceitar todos). Confirme PageView, navegue entre páginas públicas e volte: deve haver uma visita por navegação, sem duplicação por render. Rejeite marketing em outra sessão limpa: fbevents.js não deve carregar. Abra login/área privada: não deve haver novo PageView. Confira também com Meta Pixel Helper. Mantenha eventos automáticos e correspondência avançada desativados nas configurações da Meta. Estes passos não foram executados na conta Meta nem o código publicado por esta tarefa.

## Eventos futuros (não implementados)

- CompleteRegistration: somente após sucesso confirmado de `/v1/public/tenants/register`, nunca no clique do CTA ou na verificação parcial de e-mail.
- StartTrial: após confirmação efetiva `trialStarted` no cadastro ou sucesso de `/v1/public/free-trials/activate/:token`; nunca enviar token, email ou payload de cadastro.
- Lead: apenas se existir fluxo de contato comercial com envio confirmado, após mapear seu endpoint.
- Subscribe/Purchase: após confirmação confiável da assinatura/pagamento, com deduplicação e escopo de dados revisados.

Os fluxos de cadastro foram inspecionados em CreateClinicModal e FreeTrialActivationView. A futura medição precisa de revisão específica, pois essas telas estão intencionalmente excluídas do Pixel atual.
