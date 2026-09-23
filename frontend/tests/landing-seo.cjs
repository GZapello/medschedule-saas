const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderPreRenderedHtml } = require('../../backend/dist/seo/preRender');
const { SEO_ROUTES, isValidApplicationRoute } = require('../../backend/dist/seo/seoRoutes');
const { LANDING_MODULES, LANDING_PLANS } = require('../../backend/dist/seo/landingContent');
const base=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for (const route of SEO_ROUTES) {
  const html=renderPreRenderedHtml(base,route.path);
  assert.equal((html.match(/<h1[ >]/g)||[]).length,1,`${route.path}: H1`);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1,`${route.path}: canonical count`);
  assert.ok(html.includes(`href="${route.canonical}"`),`${route.path}: canonical URL`);
  assert.equal((html.match(/name="description"/g)||[]).length,1,`${route.path}: description count`);
  assert.ok(html.includes('content="index, follow"'),`${route.path}: indexing`);
}
const home=renderPreRenderedHtml(base,'/');
for(const module of LANDING_MODULES) assert.ok(home.includes(module.name));
for(const plan of LANDING_PLANS) assert.ok(home.includes(plan.price));
for(const [,href] of home.matchAll(/<a[^>]*href="([^"]+)"/g)) {
  if(href.startsWith('/')&&!href.startsWith('//')) assert.ok(isValidApplicationRoute(href.split('#')[0]||'/'),`Unregistered route: ${href}`);
}
assert.ok(!/Android|SaaS|100%/.test(home));
const notFound=renderPreRenderedHtml(base,'/rota-inexistente-qa');
assert.ok(notFound.includes('noindex, nofollow'));
assert.ok(!notFound.includes('rel="canonical"'));
console.log(`SEO: ${SEO_ROUTES.length} routes, canonical, unique H1/meta, indexable public copy, valid links and 404: OK`);
