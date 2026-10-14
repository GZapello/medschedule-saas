// O HTML pré-renderizado para SEO (Googlebot/crawlers) não pode ficar visível para pessoas
// reais: ele não tem nenhuma classe de estilo, e React (createRoot, não hydrateRoot) o
// substitui só depois do JS carregar — sem escondê-lo, ele pisca na tela ("flash de HTML cru").
const assert = require('node:assert/strict');
const { renderPreRenderedHtml } = require('./dist/seo/preRender');

const baseHtml = '<!DOCTYPE html><html><head><title>Zemda</title></head><body><div id="root"></div></body></html>';

const rootMarkup = (html) => {
  const match = html.match(/<div id="root">([\s\S]*)<\/div>\s*<\/body>/);
  assert.ok(match, 'HTML deve conter <div id="root">...</div> antes de </body>');
  return match[1];
};

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log(`  ✅ ${label}`); };

check('Página inicial ("/"): conteúdo pré-renderizado fica visualmente oculto', () => {
  const html = renderPreRenderedHtml(baseHtml, '/');
  const inner = rootMarkup(html);
  assert.ok(inner.length > 0, 'algum conteúdo deveria ter sido injetado em #root');
  assert.match(inner, /position:absolute/, 'conteúdo deveria estar dentro do wrapper visualmente oculto');
  assert.match(inner, /clip:rect\(0,0,0,0\)/, 'wrapper deveria usar a técnica padrão de visually-hidden');
});

check('Página inicial: o texto continua presente no HTML (crawlers/SEO não perdem conteúdo)', () => {
  const html = renderPreRenderedHtml(baseHtml, '/');
  assert.match(html, /Zemda/, 'o texto da marca deveria continuar no HTML bruto');
  assert.match(html, /<h1>/, 'a estrutura semântica (h1, article, section) deveria continuar presente');
});

check('Rota inexistente (404): conteúdo também fica visualmente oculto', () => {
  const html = renderPreRenderedHtml(baseHtml, '/esta-rota-nao-existe-' + Date.now());
  const inner = rootMarkup(html);
  assert.match(inner, /position:absolute/, 'conteúdo do 404 deveria estar dentro do wrapper visualmente oculto');
  assert.match(html, /404/, 'o texto "404" deveria continuar presente no HTML para crawlers');
});

check('Nenhum caminho de #root fica com HTML "cru" solto (sem wrapper) quando há conteúdo', () => {
  for (const path of ['/', '/esta-rota-nao-existe-' + Date.now()]) {
    const inner = rootMarkup(renderPreRenderedHtml(baseHtml, path));
    if (inner.trim().length > 0) {
      assert.ok(inner.trim().startsWith('<div style="position:absolute'), `conteúdo de ${path} deveria começar pelo wrapper oculto, começou com: ${inner.slice(0, 60)}`);
    }
  }
});

console.log(`\nRESULTADO: ${passed} verificações do pré-render de SEO passaram.`);
