const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SEO_ROUTES, getRouteByPath, BRAND_NAME, BRAND_ALTERNATE_NAMES, BRAND_DESCRIPTION, BRAND_SAME_AS, generateSitemapXml, generateRobotsTxt } = require('./dist/seo/seoRoutes');
const { structuredData, seoMeta, breadcrumbs, BRAND_LOGO, SEO_IMAGE } = require('./dist/seo/seoPresentation');
const { renderPreRenderedHtml } = require('./dist/seo/preRender');

let passed = 0;
const test = (label, fn) => {
  fn();
  passed++;
  console.log(`  ✅ ${label}`);
};

console.log('--- AUDITORIA E FORTALECIMENTO DE MARCA / ENTIDADE SEO ---');

test('Constantes de marca centralizadas e documentadas', () => {
  assert.equal(BRAND_NAME, 'Zemda');
  assert.deepEqual(BRAND_ALTERNATE_NAMES, ['Zemda Software', 'zemda.com.br']);
  assert.ok(BRAND_DESCRIPTION.includes('Zemda é uma plataforma de gestão em saúde'));
  assert.ok(Array.isArray(BRAND_SAME_AS));
  assert.equal(BRAND_SAME_AS.length, 0, 'BRAND_SAME_AS deve começar vazio até confirmação de perfis oficiais');
});

test('WebSite Schema: name, alternateName, publisher, url', () => {
  const home = getRouteByPath('/');
  assert.ok(home);
  const data = structuredData(home);
  const website = data['@graph'].find(n => n['@type'] === 'WebSite');
  assert.ok(website, 'Nó WebSite deve existir no @graph');
  assert.equal(website['@id'], 'https://zemda.com.br/#website');
  assert.equal(website.name, 'Zemda');
  assert.ok(Array.isArray(website.alternateName));
  assert.ok(website.alternateName.includes('Zemda Software'));
  assert.ok(website.alternateName.includes('zemda.com.br'));
  assert.equal(website.url, 'https://zemda.com.br/');
  assert.equal(website.publisher['@id'], 'https://zemda.com.br/#organization');
});

test('Organization Schema: name, alternateName, description, logo quadrado', () => {
  const home = getRouteByPath('/');
  const data = structuredData(home);
  const org = data['@graph'].find(n => n['@type'] === 'Organization');
  assert.ok(org, 'Nó Organization deve existir no @graph');
  assert.equal(org['@id'], 'https://zemda.com.br/#organization');
  assert.equal(org.name, 'Zemda');
  assert.equal(org.alternateName, 'Zemda Software');
  assert.equal(org.url, 'https://zemda.com.br/');
  assert.equal(org.description, BRAND_DESCRIPTION);
  assert.equal(org.logo, BRAND_LOGO);
  assert.ok(org.logo.includes('zemda-icon.png'), 'Logo da organização deve ser o ícone de alta resolução');
});

test('SoftwareApplication Schema: applicationCategory = HealthApplication', () => {
  const home = getRouteByPath('/');
  const data = structuredData(home);
  const appNode = data['@graph'].find(n => n['@id'] && n['@id'].endsWith('#software'));
  assert.ok(appNode, 'Nó SoftwareApplication deve existir no @graph');
  assert.equal(appNode.applicationCategory, 'HealthApplication');
  assert.equal(appNode.name, 'Zemda');
  assert.equal(appNode.operatingSystem, 'Web');
  assert.equal(appNode.url, 'https://zemda.com.br/');
  assert.equal(appNode.publisher['@id'], 'https://zemda.com.br/#organization');
  assert.ok(Array.isArray(appNode.offers) && appNode.offers.length > 0);
  assert.equal(appNode.image, SEO_IMAGE);
  // Sem ratings ou reviews inventados
  assert.equal(appNode.aggregateRating, undefined);
  assert.equal(appNode.review, undefined);
});

test('Open Graph & Twitter meta tags: consistência de marca', () => {
  const home = getRouteByPath('/');
  const meta = seoMeta(home);
  const ogSiteName = meta.find(m => m.key === 'og:site_name');
  assert.ok(ogSiteName);
  assert.equal(ogSiteName.content, 'Zemda');
  const ogTitle = meta.find(m => m.key === 'og:title');
  assert.ok(ogTitle.content.startsWith('Zemda | '));
  // Sem meta keywords
  const keywords = meta.find(m => m.key === 'keywords');
  assert.equal(keywords, undefined, 'Não deve emitir meta keywords');
});

test('Página /sobre-o-zemda: rota canônica, title, H1, description, sitemap', () => {
  const route = getRouteByPath('/sobre-o-zemda');
  assert.ok(route, 'Rota /sobre-o-zemda deve estar registrada em SEO_ROUTES');
  assert.equal(route.canonical, 'https://zemda.com.br/sobre-o-zemda');
  assert.equal(route.indexable, true);
  assert.equal(route.inSitemap, true);
  assert.equal(route.title, 'Sobre o Zemda | Software de Gestão em Saúde');
  assert.equal(route.h1, 'O que é o Zemda?');
  assert.ok(route.metaDescription.startsWith('Conheça o Zemda: software de gestão em saúde'));

  const sitemap = generateSitemapXml();
  assert.ok(sitemap.includes('<loc>https://zemda.com.br/sobre-o-zemda</loc>'));

  const baseHtml = '<!DOCTYPE html><html><head><title>Test</title></head><body><div id="root"></div></body></html>';
  const rendered = renderPreRenderedHtml(baseHtml, '/sobre-o-zemda');
  assert.ok(rendered.includes('O que é o Zemda?'));
  assert.ok(rendered.includes('https://zemda.com.br/sobre-o-zemda'));
  assert.ok(rendered.includes('content="index, follow"'));
});

test('Home: título novo, description com marca e kicker visível', () => {
  const home = getRouteByPath('/');
  assert.equal(home.title, 'Zemda | Software para Clínicas e Prontuário Eletrônico');
  assert.ok(home.metaDescription.startsWith('Zemda é um software de gestão em saúde'));

  const baseHtml = '<!DOCTYPE html><html><head><title>Test</title></head><body><div id="root"></div></body></html>';
  const rendered = renderPreRenderedHtml(baseHtml, '/');
  assert.ok(rendered.includes('Zemda · software de gestão em saúde'), 'Kicker visível deve estar presente no pre-render da Home');
  assert.ok(rendered.includes('Seu atendimento e sua gestão, conectados.'));
});

test('Breadcrumbs: raiz usa "Zemda" com URL canônica https://zemda.com.br/', () => {
  for (const route of SEO_ROUTES) {
    const crumbs = breadcrumbs(route);
    assert.equal(crumbs[0].name, 'Zemda', `${route.path}: breadcrumb raiz deve ser "Zemda"`);
    assert.equal(crumbs[0].url, 'https://zemda.com.br/', `${route.path}: URL do breadcrumb raiz deve ser a Home`);
  }
});

test('Links internos contextuais nos artigos do blog para a Home', () => {
  const art1 = getRouteByPath('/blog/como-reduzir-faltas-de-pacientes');
  const art2 = getRouteByPath('/blog/prontuario-eletronico-vs-papel');
  const art3 = getRouteByPath('/blog/gestao-de-clinica-multiprofissional');

  const baseHtml = '<!DOCTYPE html><html><head><title>Test</title></head><body><div id="root"></div></body></html>';
  for (const art of [art1, art2, art3]) {
    const html = renderPreRenderedHtml(baseHtml, art.path);
    assert.ok(html.includes('<a href="/">Zemda, plataforma de gestão em saúde</a>'), `${art.path}: deve conter link contextual para a Home`);
  }
});

test('Rotas privadas preservadas fora do índice', () => {
  const robots = generateRobotsTxt();
  assert.ok(robots.includes('Disallow: /api/'));
  assert.ok(robots.includes('Disallow: /v1/'));

  const sitemap = generateSitemapXml();
  for (const priv of ['/login', '/dashboard', '/agenda', '/pacientes', '/agendar', '/convite']) {
    assert.ok(!sitemap.includes(`<loc>https://zemda.com.br${priv}</loc>`), `Rota privada ${priv} não pode estar no sitemap`);
  }
});

console.log(`\nTODAS AS ${passed} VERIFICAÇÕES DE IDENTIDADE DE MARCA E ENTIDADE PASSARAM COM SUCESSO.`);
