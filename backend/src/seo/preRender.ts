import { renderSeoHead, renderEditorialContent } from './seoPresentation';
import { LANDING_HERO, LANDING_MODULES, LANDING_PLANS, LANDING_STEPS, LANDING_LAYERS, LANDING_FAQS, moduleHref } from './landingContent';
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
  let html = baseIndexHtml.replace(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
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

  html = renderSeoHead(html, seoData);

  // Monta links de navegação para o ecossistema de saúde
  const allNichesLinks = Object.values(PUBLIC_NICHE_PAGES)
    .map(p => `<li><a href="${p.path}">${p.badge}</a></li>`)
    .join('\n');

  let bodyContent = '';

  if (normPath === '/') {
    // Reuse public copy so the indexable HTML reflects the actual landing.
    bodyContent = `
      <article id="inicio">
        <header><p>Ecossistema de Saúde &amp; Gestão</p><h1>${LANDING_HERO.title}</h1><p>${LANDING_HERO.description}</p><a href="/login">Começar agora</a> <a href="#profissoes">Conhecer os módulos</a></header>
        <section id="produto"><h2>O ecossistema Zemda</h2><p>Dashboard, Agenda Interativa, prontuário, módulos especializados e painel financeiro conectam a rotina da clínica.</p></section>
        <section id="como-funciona"><h2>Como o Zemda funciona</h2>${LANDING_STEPS.map(step => `<h3>${step.title}</h3><p>${step.description}</p>`).join('')}<p>O plano define quantos usuários sua clínica possui. A profissão define quais ferramentas clínicas cada profissional acessa, respeitando suas permissões.</p></section>
        <section id="profissoes"><h2>Ecossistema profissional</h2>${LANDING_MODULES.map(module => `<article id="modulo-${module.id}"><h3>${module.name} — ${module.profession}</h3><ul>${module.features.map(feature => `<li>${feature}</li>`).join('')}</ul><a href="${moduleHref(module)}">Conhecer módulo ${module.name}</a></article>`).join('')}</section>
        <section id="zemdabody"><h2>ZemdaBody — módulo transversal</h2><p>Mapa corporal e acompanhamento visual: registre regiões corporais, marque achados clínicos e acompanhe visualmente a evolução do paciente ao longo dos atendimentos.</p></section>
        <section id="funcionalidades"><h2>Um sistema, várias camadas</h2>${LANDING_LAYERS.map(layer => `<h3>${layer.title}</h3><p>${layer.description}</p><ul>${layer.items.map(item => `<li>${item}</li>`).join('')}</ul>`).join('')}</section>
        <section id="agenda"><h2>Agenda &amp; comunicação</h2><p>Agenda Interativa, Agenda de Hoje, agendamento online e página própria do profissional. Acompanhe status, faltas e cancelamentos. Lembrete manual pelo WhatsApp e lembretes automáticos quando configurados. Integração com WhatsApp disponível conforme configuração.</p><a href="/agenda-online">Conhecer a agenda</a></section>
        <section id="autosave"><h2>Atendimento sem perder o contexto</h2><p>Psicologia e Fonoaudiologia contam com salvamento automático e recuperação de rascunhos quando disponíveis no navegador ou no servidor. Confira o indicador de salvamento e finalize o atendimento ao concluir. Projetado para reduzir o risco de perda de dados durante o atendimento.</p></section>
        <section id="documentos"><h2>Documentos &amp; prontuário</h2><p>Atestados, receituários, pedidos de exames e documentos profissionais conforme a área de atuação. Emissão A4, anexos, histórico, registro de autoria e auditoria relacionados ao paciente e ao atendimento.</p><a href="/prontuario">Conhecer o prontuário</a></section>
        <section id="gestao"><h2>Gestão &amp; financeiro</h2><p>Receitas, despesas, caixa, comissões e relatórios. Equipe, profissões, serviços, pacientes e estoque em uma base compartilhada.</p><a href="/gestao-financeira">Conhecer a gestão</a></section>
        <section id="ia"><h2>IA como apoio, não como substituição profissional.</h2><p>Estruturação de texto, apoio à evolução, ditado, organização, sugestões e relatórios assistidos nos fluxos disponíveis.</p><p>Todo conteúdo clínico gerado ou estruturado por IA exige revisão e responsabilidade do profissional.</p></section>
        <section id="seguranca"><h2>Segurança &amp; privacidade</h2><p>Controle por usuário, permissões, isolamento por clínica, acesso conforme profissão, trilha de auditoria e registro de autoria.</p><a href="/privacidade">Privacidade e LGPD</a></section>
        <section id="planos"><h2>O tamanho da equipe define o plano</h2>${LANDING_PLANS.map(plan => `<h3>${plan.name}</h3><p>R$ ${plan.price}/mês — ${plan.accesses}. ${plan.description}</p>`).join('')}<p>O plano define o número de acessos. A profissão define o módulo clínico. Gestão, prontuário, agenda, ZemdaBody, financeiro e documentos conforme perfil e permissões. Consulte condições de suporte na contratação.</p><a href="/planos">Planos e valores</a></section>
        <section id="faq"><h2>Perguntas frequentes</h2>${LANDING_FAQS.map(faq => `<h3>${faq.question}</h3><p>${faq.answer}</p>`).join('')}</section>
        <section><h2>Sua clínica não precisa de vários sistemas.</h2><p>Precisa de um sistema que entenda como você trabalha.</p><a href="/login">Começar agora</a> <a href="/login">Entrar no Zemda</a></section>
      </article>`;
  } else {
    bodyContent = renderEditorialContent(seoData);
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
  <main class="${normPath === '/' ? '' : 'seo-editorial'}">
    ${bodyContent}
  </main>
  <footer>
    <p>© ${new Date().getFullYear()} Zemda Tecnologia em Saúde • Ecossistema multiprofissional de saúde e gestão.</p>
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
