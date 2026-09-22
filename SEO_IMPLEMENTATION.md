# SEO técnico e estrutural — Zemda

Implementação local concluída em 22/09/2026. Domínio canônico: https://zemda.com.br. Nenhum commit, push, deploy ou alteração no Search Console foi realizado.

## Resultado e validação

- 22 URLs públicas indexáveis, incluindo quatro novas soluções e três artigos completos.
- Builds de frontend (TypeScript + Vite) e backend (TypeScript) aprovados.
- HTML inicial e React conferidos em todas as 22 URLs: title, description, canonical, robots, H1, Open Graph, Twitter e JSON-LD equivalentes, sem duplicação.
- Testes HTTP: 200 nas páginas existentes, 301 no www e trailing slash, 404 em URL inexistente; rotas operacionais privadas continuam noindex/nofollow e fora do sitemap.
- XML do sitemap e sitemap index analisado por parser XML; robots e sitemap gerado no build conferidos contra a mesma configuração do backend.
- Navegação SPA, retorno pelo histórico e layout de 390px sem overflow horizontal aprovados.
- Smoke autenticado de dashboard, agenda e pacientes aprovado com respostas de API inteiramente fictícias. Não é uma validação integral de todos os processos clínicos, financeiros ou de pagamento.
- Regressão do Meta Pixel: 18 verificações e teste da aplicação compilada aprovados, com SDK simulado, sem enviar eventos de teste à Meta.

## 1. Arquivos criados

- `backend/src/seo/blogContent.ts`
- `backend/src/seo/publicSite.ts`
- `backend/src/seo/seoPresentation.ts`
- `frontend/public/brand/zemda-icon-96.webp`
- `frontend/public/brand/zemda-social.png`
- `frontend/scripts/optimize-public-images.cjs`
- `frontend/src/components/public/seo-editorial.css`
- `frontend/src/utils/publicSeo.ts`
- `frontend/tests/seo-private-smoke.cjs`
- `frontend/tests/seo-public-browser.cjs`
- `SEO_IMPLEMENTATION.md`

## 2. Arquivos alterados

- `backend/src/seo/landingContent.ts`
- `backend/src/seo/preRender.ts`
- `backend/src/seo/seoRoutes.ts`
- `backend/src/server.ts`
- `frontend/index.html`
- `frontend/src/App.tsx`
- `frontend/src/components/common/CookieBanner.tsx`
- `frontend/src/components/common/CookiePreferencesModal.tsx`
- `frontend/src/components/public/LandingProductDemo.tsx`
- `frontend/src/components/public/PrivacyPolicyView.tsx`
- `frontend/src/components/public/PublicFooter.tsx`
- `frontend/src/components/public/PublicHeader.tsx`
- `frontend/src/components/public/PublicSeoPageView.tsx`
- `frontend/src/components/public/TermsOfUseView.tsx`
- `frontend/src/components/public/ZemdaLandingPage.tsx`
- `frontend/vite.config.ts`

Arquivos estáticos removidos do código-fonte:

- `frontend/public/robots.txt`
- `frontend/public/sitemap.xml`

Os equivalentes de robots.txt e sitemap.xml continuam existindo no build: agora são gerados automaticamente. Um exemplar deste relatório e a captura mobile estão também na pasta outputs/seo da tarefa.

## 3–4. Novas páginas e rotas

| Página | Rota |
|---|---|
| ZemdaOdonto | /sistema-para-dentistas |
| ZemdaTO | /sistema-para-terapeutas-ocupacionais |
| ZemdaPersonal | /sistema-para-personal-trainers |
| ZemdaBody, módulo transversal | /mapa-corporal-clinico |
| Como organizar a agenda para reduzir faltas | /blog/como-reduzir-faltas-de-pacientes |
| Prontuário eletrônico ou papel | /blog/prontuario-eletronico-vs-papel |
| Gestão de clínica multiprofissional | /blog/gestao-de-clinica-multiprofissional |

/blog é uma listagem real e cada artigo tem conteúdo próprio, entidade responsável, datas, links e CTA. Cinco pautas adicionais ficam em BLOG_PLANNED_TOPICS, sem URLs vazias: organização de agenda, prontuário para fonoaudiologia, prontuário para fisioterapia, organização financeira e segurança de informações clínicas. Não foram publicadas páginas de preenchimento para essas pautas.

Os artigos usam a data editorial de 22/09/2026. Se a primeira publicação acontecer depois, conferir a data published no processo de publicação. Atualizar modified somente após revisão material.

## Arquitetura centralizada

seoRoutes.ts contém o catálogo público e as regras de URL, indexação e sitemap. landingContent.ts fornece o conteúdo compartilhado da Home e os planos públicos existentes; blogContent.ts fornece os artigos. Esses módulos são dados públicos, sem imports de banco, secrets ou usuários.

seoPresentation.ts deriva metatags, schema, breadcrumbs e HTML editorial. O prerender e o React usam o mesmo renderizador para as páginas profissionais, recursos e blog. Os dados textuais são escapados antes da interpolação em HTML. O JSON-LD é serializado com proteção contra fechamento de script.

O index.html deixa de armazenar metadados paralelos: o plugin Vite gera o head da Home a partir do catálogo. O backend substitui pelo head da rota acessada; publicSeo.ts mantém os mesmos valores após a aplicação carregar. Removidos os escritores concorrentes de title das páginas legais. A Home agora compartilha H1 e introdução com a pré-renderização, preservando seu texto visível e as duas linhas do título.

O prerender foi preservado. Páginas de soluções, recursos e artigos têm conteúdo editorial completo no HTML inicial. Páginas legais mantêm o texto jurídico existente no React e um resumo institucional no HTML inicial. Planos preservam o fluxo de contratação e a consulta aos valores da API; não foram alteradas cobranças nem regras comerciais.

## 5. Sitemap e robots

- sitemap.xml deriva exclusivamente de SEO_ROUTES: 22 URLs públicas, sem login, APIs ou rotas privadas.
- sitemap_index.xml retorna sitemapindex válido apontando para https://zemda.com.br/sitemap.xml.
- Removidas cópias manuais em frontend/public; Vite emite sitemap.xml e robots.txt com os mesmos geradores usados pelo backend.
- lastmod apenas nos artigos, a partir da data editorial explícita; não é atualizado automaticamente em cada build ou requisição.
- robots permite o site e bloqueia /api/ e /v1/, anunciando o sitemap oficial.
- A infraestrutura pública foi extraída para publicSite.ts, permitindo testar status e pré-renderização sem iniciar banco ou APIs.
- Falha inesperada de renderização retorna 500/noindex, em vez de servir um index público genérico com 200.

## 6. Structured data

Um único script JSON-LD por página, com IDs estáveis: Organization, WebSite, WebPage e BreadcrumbList. Home e planos têm SoftwareApplication com preços derivados de LANDING_PLANS. Artigos têm BlogPosting, autor como organização Equipe Zemda, datas e referência à página.

Não há ratings, reviews, números de clientes ou avaliações inventados. Imagens sociais usam a marca real otimizada; não foram inventadas fotografias editoriais. Os breadcrumbs visuais são gerados nas páginas editoriais; os dados estruturados também existem nas demais páginas indexáveis.

## 7. Performance e acessibilidade

| Recurso | Antes | Depois |
|---|---:|---:|
| JavaScript inicial, sem gzip | 2.763,20 KB | 452,29 KB |
| JavaScript inicial, gzip | 590,52 KB | 126,14 KB |
| Ícone público usado em tamanho pequeno | 513.728 bytes | 2.852 bytes, WebP 96px |
| Imagem social | 513.728 bytes | 35.665 bytes, PNG 512px |

Redução aproximada de 83,6% no JS inicial e 78,6% após gzip. Baseline: build anterior ao trabalho de SEO. O volume total da aplicação continua disponível em chunks, carregados quando necessários.

React.lazy/import dinâmico para módulos clínicos, financeiro, estoque, administração, relatórios, IA, agenda interna, pacientes e telas de autenticação. Suspense mantém fallback de carregamento. Overlays autenticados só montam com usuário conectado. Nenhum código de regra clínica foi modificado. O navegador confirmou que a landing não solicita os chunks clínicos, financeiros, administrativos ou de login.

As imagens públicas pequenas usam WebP, com dimensões explícitas. O logo do header continua sem lazy loading; o footer mantém lazy. Os arquivos originais permanecem disponíveis para usos internos. O script de otimização usa sharp já instalado no backend. Não foi adicionada dependência.

Páginas editoriais usam main/article/nav/section/header, um H1, subtítulos H2, links descritivos, details/summary operáveis por teclado e foco visível. O layout mobile foi conferido. O CSS novo está restrito às páginas editoriais.

Corrigido o histórico público: popstate não empurra mais a Home ao voltar de uma página SEO. O tratamento nativo e o comportamento de navegação autenticada foram preservados. O CTA de acesso de uma página SEO limpa o estado da página antes de abrir o fluxo de login existente.

## 8. Claims revisados

O catálogo anterior foi reescrito com base nos recursos encontrados no código dos módulos e nas demonstrações existentes. Removidos ou substituídos:

- reduções de faltas de 45%/50% e redução comprovada;
- segurança absoluta, privacidade absoluta e infraestrutura blindada;
- criptografia de ponta a ponta e backups diários como garantias universais;
- conformidade total com LGPD/conselhos e atendimento a todos os requisitos fiscais;
- recibos tratados como comprovantes fiscais automaticamente válidos;
- promessas de comparecimento, proteção jurídica, rentabilidade e produtividade garantidas;
- autoria por especialistas não identificados e metodologias comprovadas sem evidência;
- expressão de garantia e qualificação de métricas como anônimas nos textos públicos de cookies.

Em seu lugar, descrições de permissões, organização, autoria e recursos efetivos, com condições para lembretes e responsabilidade profissional na revisão de documentos. A lógica de consentimento e os eventos do Pixel permanecem inalterados. As sete novas URLs não foram adicionadas automaticamente à lista restrita de rastreamento do Pixel: ampliar tracking requer revisão específica.

## 9. Limites e acompanhamento após publicação

Não foi feita publicação, acesso ao Search Console, alteração de Cloudflare ou medição de Core Web Vitals em produção. A redução de bundle é medida; melhora de LCP/INP/CLS, indexação e resultados orgânicos não é garantida nem foi declarada como observada.

Após o deploy habitual: enviar sitemap no Search Console, inspecionar URLs novas, conferir HTML renderizado e rich results, acompanhar cobertura e Core Web Vitals. A configuração TLS/proxy existente não foi alterada. A implantação precisa continuar servindo as páginas pelo backend para entregar o conteúdo pré-renderizado; um servidor estático genérico do dist não substitui esse fluxo.

Não houve alterações em banco, autenticação, permissões, pagamentos/Asaas, WhatsApp, Cloudflare, armazenamento ou componentes clínicos. O teste autenticado usa fixtures e não substitui uma homologação funcional abrangente com os responsáveis pelo SaaS.

## 10. Comandos de teste

PowerShell, a partir da raiz do projeto:

```powershell
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
node frontend/scripts/optimize-public-images.cjs
```

Regenerar imagens apenas quando os arquivos originais mudarem; executar o build frontend novamente depois dessa regeneração.

Testes de navegador usam Playwright já disponível neste ambiente, sem instalar pacote no projeto:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
Set-Location frontend
node tests/seo-public-browser.cjs
node tests/seo-private-smoke.cjs
node tests/landing-seo.cjs
node tests/meta-pixel-browser.cjs
node tests/meta-pixel-app-browser.cjs
```

Em outro ambiente, ajustar PLAYWRIGHT_MODULE/CHROME_PATH para a instalação disponível. O teste público inicia e encerra seu próprio servidor HTTP usando a infraestrutura real publicSite, com APIs externas interceptadas; não exige iniciar o backend clínico.

## 11. Comandos Git recomendados

Na raiz, revisar os arquivos antes de preparar o commit:

```powershell
git status --short
git diff --check
git diff --stat
git diff -- backend/src/seo backend/src/server.ts frontend/src/App.tsx frontend/vite.config.ts frontend/index.html
git add -p
```

Adicionar explicitamente os arquivos novos, após revisão:

```powershell
git add -- "backend/src/seo/blogContent.ts" "backend/src/seo/publicSite.ts" "backend/src/seo/seoPresentation.ts" "frontend/public/brand/zemda-icon-96.webp" "frontend/public/brand/zemda-social.png" "frontend/scripts/optimize-public-images.cjs" "frontend/src/components/public/seo-editorial.css" "frontend/src/utils/publicSeo.ts" "frontend/tests/seo-private-smoke.cjs" "frontend/tests/seo-public-browser.cjs" "SEO_IMPLEMENTATION.md"
git diff --cached --stat
git diff --cached --check
git commit -m "Improve public SEO architecture, content and code splitting"
```

Nenhum desses comandos de staging/commit/push foi executado nesta tarefa.

## Referências técnicas consultadas

A consistência do canonical entre HTML inicial e JavaScript segue a orientação do [Google sobre SEO em JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics). O uso de datas editoriais em lastmod segue a [documentação de sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

BlogPosting e autoria foram conferidos na [documentação de Article do Google](https://developers.google.com/search/docs/appearance/structured-data/article). O carregamento sob demanda segue a [documentação de React.lazy](https://react.dev/reference/react/lazy).
