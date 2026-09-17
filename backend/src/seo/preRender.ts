// Motor de Pré-renderização e SEO para Googlebot e Web Crawlers da Plataforma Zemda
import {
  SEO_ROUTES,
  SeoRoute,
  SeoPageData,
  PUBLIC_NICHE_PAGES,
  getRouteByPath,
  isPublicRoute,
  isValidInternalRoute,
  isValidApplicationRoute,
  normalizePath,
  OFFICIAL_DOMAIN
} from './seoRoutes';

export type { SeoRoute, SeoPageData };
export const BACKEND_SEO_PAGES = PUBLIC_NICHE_PAGES;

function setMetaTag(html: string, nameOrProperty: 'name' | 'property', key: string, content: string): string {
  const regex = new RegExp(`<meta\\s+[^>]*${nameOrProperty}=["']${key}["'][^>]*>`, 'i');
  const newTag = `<meta ${nameOrProperty}="${key}" content="${content}" />`;
  if (regex.test(html)) {
    return html.replace(regex, newTag);
  }
  return html.replace('</head>', `  ${newTag}\n</head>`);
}

function setCanonicalTag(html: string, canonicalUrl: string | null): string {
  const regex = /<link\s+[^>]*rel=["']canonical["'][^>]*>\s*/gi;
  if (!canonicalUrl) {
    return html.replace(regex, '');
  }
  const newTag = `<link rel="canonical" href="${canonicalUrl}" />`;
  if (regex.test(html)) {
    return html.replace(regex, newTag);
  }
  return html.replace('</head>', `  ${newTag}\n</head>`);
}

function setTitleTag(html: string, title: string): string {
  const regex = /<title>.*?<\/title>/i;
  const newTag = `<title>${title}</title>`;
  if (regex.test(html)) {
    return html.replace(regex, newTag);
  }
  return html.replace('</head>', `  ${newTag}\n</head>`);
}

export function renderPreRenderedHtml(baseIndexHtml: string, reqPath: string): string {
  let html = baseIndexHtml;
  const normPath = normalizePath(reqPath);

  // 1. Injeta Google Site Verification se a variável estiver definida
  const gscCode = process.env.GOOGLE_SITE_VERIFICATION || process.env.VITE_GOOGLE_SITE_VERIFICATION;
  if (gscCode) {
    const gscTag = `<meta name="google-site-verification" content="${gscCode}" />`;
    html = html.replace('<!-- %GOOGLE_SITE_VERIFICATION_TAG% -->', gscTag);
  }

  // 2. Injeta Google Analytics se o ID estiver configurado
  const gaId = process.env.VITE_GA_MEASUREMENT_ID || process.env.GA_MEASUREMENT_ID;
  if (gaId) {
    const gaScript = `
    <!-- Global site tag (gtag.js) - Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${gaId}');
    </script>`;
    html = html.replace('<!-- %GA_TRACKING_SCRIPT% -->', gaScript);
  }

  // 3. Se a rota NÃO é válida na aplicação (nem pública nem rota interna legítima): Erro 404
  if (!isValidApplicationRoute(normPath)) {
    html = setTitleTag(html, 'Página não encontrada (404) | Zemda');
    html = setMetaTag(html, 'name', 'description', 'A página solicitada não foi encontrada no Zemda.');
    html = setMetaTag(html, 'name', 'robots', 'noindex, nofollow');
    html = setCanonicalTag(html, null);

    const notFoundContent = `
    <main style="min-height:70vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:3rem 1.5rem; font-family:sans-serif; color:#1e293b;">
      <h1 style="font-size:3rem; font-weight:900; color:#0f766e; margin-bottom:1rem;">404</h1>
      <h2 style="font-size:1.5rem; font-weight:700; margin-bottom:0.75rem;">Página não encontrada</h2>
      <p style="color:#64748b; max-width:480px; line-height:1.6; margin-bottom:1.5rem;">
        O endereço que você tentou acessar não existe, foi removido ou está temporariamente indisponível.
      </p>
      <a href="/" style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.75rem 1.5rem; border-radius:1rem; background:linear-gradient(to right, #0d9488, #059669); color:#ffffff; text-decoration:none; font-weight:bold; font-size:0.875rem;">
        Voltar para a página inicial
      </a>
    </main>
    `;
    html = html.replace('<div id="root"></div>', `<div id="root">${notFoundContent}</div>`);
    return html;
  }

  // 4. Se for rota interna legítima (deep link autenticado / área privada)
  if (isValidInternalRoute(normPath) && !isPublicRoute(normPath)) {
    html = setTitleTag(html, 'Zemda • Acesso Seguro');
    html = setMetaTag(html, 'name', 'robots', 'noindex, nofollow');
    html = setCanonicalTag(html, null);
    return html;
  }

  // 5. Rota Pública Válida
  const seoData = getRouteByPath(normPath);
  if (!seoData) {
    return html;
  }

  // Metatags de cabeçalho específicas para essa página
  html = setTitleTag(html, seoData.title);
  html = setMetaTag(html, 'name', 'description', seoData.metaDescription);
  if (seoData.keywords) {
    html = setMetaTag(html, 'name', 'keywords', seoData.keywords);
  }
  html = setMetaTag(html, 'name', 'robots', 'index, follow');
  html = setCanonicalTag(html, seoData.canonical);
  html = setMetaTag(html, 'property', 'og:title', seoData.title);
  html = setMetaTag(html, 'property', 'og:description', seoData.metaDescription);
  html = setMetaTag(html, 'property', 'og:url', seoData.canonical);
  html = setMetaTag(html, 'name', 'twitter:title', seoData.title);
  html = setMetaTag(html, 'name', 'twitter:description', seoData.metaDescription);

  // Monta links de navegação para o ecossistema de saúde
  const allNichesLinks = Object.values(PUBLIC_NICHE_PAGES)
    .map(p => `<li><a href="${p.path}">${p.badge}</a></li>`)
    .join('\n');

  let bodyContent = '';

  if (seoData.features && seoData.features.length > 0) {
    // Páginas de nicho ricas
    const featuresHtml = (seoData.features || [])
      .map(f => `<div><h3>${f.title}</h3><p>${f.description}</p></div>`)
      .join('\n');

    const benefitsHtml = (seoData.benefits || [])
      .map(b => `<li>${b}</li>`)
      .join('\n');

    const faqsHtml = (seoData.faqs || [])
      .map(faq => `<div><h3>${faq.question}</h3><p>${faq.answer}</p></div>`)
      .join('\n');

    bodyContent = `
    <article>
      <header>
        ${seoData.badge ? `<span>${seoData.badge}</span>` : ''}
        <h1>${seoData.h1 || seoData.title}</h1>
        ${seoData.h2 ? `<h2>${seoData.h2}</h2>` : ''}
        <p>${seoData.summary || seoData.metaDescription}</p>
        <p><a href="/planos">Conheça os Planos e Valores do Zemda</a></p>
      </header>
      <section>
        <h2>Principais Recursos do Sistema</h2>
        ${featuresHtml}
      </section>
      <section>
        <h2>Benefícios para Profissionais e Clínicas</h2>
        <ul>${benefitsHtml}</ul>
      </section>
      <section>
        <h2>Perguntas Frequentes (FAQ)</h2>
        ${faqsHtml}
      </section>
    </article>
    `;
  } else {
    // Páginas institucionais (Home, Planos, Termos, Privacidade)
    bodyContent = `
    <article>
      <header>
        ${seoData.badge ? `<span>${seoData.badge}</span>` : ''}
        <h1>${seoData.h1 || seoData.title}</h1>
        ${seoData.h2 ? `<h2>${seoData.h2}</h2>` : ''}
        <p>${seoData.summary || seoData.metaDescription}</p>
      </header>
    </article>
    `;
  }

  const semanticContent = `
  <header>
    <nav>
      <a href="/">Zemda • Tecnologia em Saúde</a>
      <ul>
        <li><a href="/planos">Planos</a></li>
        ${allNichesLinks}
      </ul>
    </nav>
  </header>
  <main>
    ${bodyContent}
  </main>
  <footer>
    <p>© ${new Date().getFullYear()} Zemda Tecnologia em Saúde • Plataforma disponível para Web, Windows e Android.</p>
    <ul>
      <li><a href="/termos-de-uso">Termos de Uso</a></li>
      <li><a href="/privacidade">Privacidade</a></li>
    </ul>
  </footer>
  `;

  // Injeta dentro do div #root antes da hidratação do React
  html = html.replace('<div id="root"></div>', `<div id="root">${semanticContent}</div>`);

  return html;
}
