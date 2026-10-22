const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderPreRenderedHtml } = require('../../backend/dist/seo/preRender');
const { SEO_ROUTES, isValidApplicationRoute, generateSitemapXml } = require('../../backend/dist/seo/seoRoutes');
const { LANDING_MODULES, LANDING_PLANS } = require('../../backend/dist/seo/landingContent');
const { structuredData, seoMeta, breadcrumbs } = require('../../backend/dist/seo/seoPresentation');
const base = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

for (const route of SEO_ROUTES) {
  const html = renderPreRenderedHtml(base, route.path);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${route.path}: H1`);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1, `${route.path}: canonical count`);
  assert.ok(html.includes(`href="${route.canonical}"`), `${route.path}: canonical URL`);
  assert.equal((html.match(/name="description"/g) || []).length, 1, `${route.path}: description count`);
  assert.ok(html.includes('content="index, follow"'), `${route.path}: indexing`);
}

const home = renderPreRenderedHtml(base, '/');
for (const module of LANDING_MODULES) assert.ok(home.includes(module.name));
for (const plan of LANDING_PLANS) assert.ok(home.includes(plan.price));
for (const [, href] of home.matchAll(/<a[^>]*href="([^"]+)"/g)) {
  if (href.startsWith('/') && !href.startsWith('//')) assert.ok(isValidApplicationRoute(href.split('#')[0] || '/'), `Unregistered route: ${href}`);
}
assert.ok(!/Android|SaaS|100%/.test(home));

// Brand entity: Home visible kicker text
assert.ok(home.includes('Zemda · software de gestão em saúde'), 'Home pre-rendered HTML must contain visible kicker "Zemda · software de gestão em saúde"');

// Brand entity: WebSite schema
const homeRoute = SEO_ROUTES.find(r => r.path === '/');
const homeData = structuredData(homeRoute);
const graph = homeData['@graph'];

const websiteNode = graph.find(n => n['@type'] === 'WebSite');
assert.ok(websiteNode, 'WebSite schema node missing');
assert.equal(websiteNode.name, 'Zemda', 'WebSite.name must be "Zemda"');
assert.ok(Array.isArray(websiteNode.alternateName), 'WebSite.alternateName must be array');
assert.ok(websiteNode.alternateName.includes('Zemda Software'), 'WebSite.alternateName must contain "Zemda Software"');
assert.ok(websiteNode.alternateName.includes('zemda.com.br'), 'WebSite.alternateName must contain "zemda.com.br"');

// Brand entity: Organization schema
const orgNode = graph.find(n => n['@type'] === 'Organization');
assert.ok(orgNode, 'Organization schema node missing');
assert.equal(orgNode.name, 'Zemda', 'Organization.name must be "Zemda"');
assert.ok(orgNode.description && orgNode.description.length > 20, 'Organization.description must be present');
assert.ok(orgNode.logo && orgNode.logo.includes('zemda-icon.png'), 'Organization.logo must be square brand icon');

// Brand entity: SoftwareApplication schema
const softwareNode = graph.find(n => n['@id'] && n['@id'].endsWith('#software'));
assert.ok(softwareNode, 'SoftwareApplication node missing');
assert.equal(softwareNode.applicationCategory, 'HealthApplication', 'SoftwareApplication.applicationCategory must be "HealthApplication"');

// Brand entity: Open Graph
const metaHome = seoMeta(homeRoute);
const ogSiteName = metaHome.find(m => m.key === 'og:site_name');
assert.ok(ogSiteName, 'og:site_name meta missing');
assert.equal(ogSiteName.content, 'Zemda', 'og:site_name must be "Zemda"');

// Brand entity: Breadcrumbs root
for (const route of SEO_ROUTES) {
  const crumbs = breadcrumbs(route);
  assert.equal(crumbs[0].name, 'Zemda', `${route.path}: root breadcrumb name must be "Zemda"`);
  assert.equal(crumbs[0].url, 'https://zemda.com.br/', `${route.path}: root breadcrumb url must be "https://zemda.com.br/"`);
}

// Brand entity: /sobre-o-zemda
const sobreRoute = SEO_ROUTES.find(r => r.path === '/sobre-o-zemda');
assert.ok(sobreRoute, '/sobre-o-zemda missing from SEO_ROUTES');
assert.equal(sobreRoute.canonical, 'https://zemda.com.br/sobre-o-zemda');
assert.equal(sobreRoute.indexable, true);
assert.equal(sobreRoute.inSitemap, true);
assert.equal(sobreRoute.title, 'Sobre o Zemda | Software de Gestão em Saúde');
assert.equal(sobreRoute.h1, 'O que é o Zemda?');
assert.ok(sobreRoute.metaDescription.startsWith('Conheça o Zemda: software de gestão em saúde'));

const sobreHtml = renderPreRenderedHtml(base, '/sobre-o-zemda');
assert.ok(sobreHtml.includes('O que é o Zemda?'), '/sobre-o-zemda must contain H1 in initial HTML');
assert.ok(sobreHtml.includes('https://zemda.com.br/sobre-o-zemda'), '/sobre-o-zemda must contain canonical');
assert.ok(sobreHtml.includes('index, follow'), '/sobre-o-zemda must be indexable');

const sitemapXml = generateSitemapXml();
assert.ok(sitemapXml.includes('<loc>https://zemda.com.br/sobre-o-zemda</loc>'), 'Sitemap must contain /sobre-o-zemda');

const notFound = renderPreRenderedHtml(base, '/rota-inexistente-qa');
assert.ok(notFound.includes('noindex, nofollow'));
assert.ok(!notFound.includes('rel="canonical"'));

console.log(`SEO: ${SEO_ROUTES.length} routes, entity invariants (WebSite, Organization, HealthApplication, og:site_name, /sobre-o-zemda, kicker, breadcrumbs), valid links and 404: OK`);
