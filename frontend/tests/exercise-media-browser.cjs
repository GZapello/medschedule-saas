const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_EXERCISE_LIBRARY } = require('../../backend/dist/config/exercise-library.seed');
const { exerciseAnimation } = require('../../backend/dist/services/exercise-media');
const { matchesExercise, imageAttribution } = require('../../backend/dist/services/personal-exercise-utils');
const media = require('../../backend/src/config/exercise-library.media.json');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
const out = process.env.TEST_OUTPUT_DIR || path.join(__dirname, 'results');

async function main() {
  const browser = await chromium.launch({ headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}) });
  try {
    fs.mkdirSync(out, {recursive:true});
    const page = await browser.newPage({viewport:{width:1280,height:960}});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const catalog = DEFAULT_EXERCISE_LIBRARY.map(ex => ({...ex, ...exerciseAnimation({...ex,tenant_id:'global',is_custom:0}), is_active:1,is_custom:0, image_attribution_json:imageAttribution(null,null,ex.photo_url)}));
    let failImage = false, failGif = false, gifRequests = 0;
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname.endsWith('.gif')) { gifRequests++; if (failGif) return route.abort(); }
      if (failImage && url.pathname.startsWith('/exercise-media/') && url.pathname.endsWith('.jpg')) return route.abort();
      if (url.pathname.endsWith('/personal/exercises')) return route.fulfill({json:{exercises:catalog.filter(ex => matchesExercise(ex,Object.fromEntries(url.searchParams)))}});
      if (url.pathname.startsWith('/api/')) return route.fulfill({json:{}});
      return route.continue();
    });
    await page.goto(`${base}/tests/exercise-library.html`);
    await page.getByText('268 exercícios encontrados').waitFor();
    assert.equal(gifRequests, 0, 'Catalogue must not download animations');
    const search = async text => { const input=page.locator('input[type="text"]').first(); await input.fill(text); await input.press('Enter'); await page.getByText('1 exercícios encontrados').waitFor(); };
    await search('Agachamento Goblet');
    await page.waitForFunction(() => [...document.images].some(i => i.src.endsWith('/ex-agachamento-goblet.jpg') && i.naturalWidth > 0));
    assert.equal(await page.locator('img').first().evaluate(i => getComputedStyle(i).objectFit), 'contain');
    await page.screenshot({path:path.join(out,'media-catalogue.png')});
    await page.getByRole('button',{name:'Ver detalhes',exact:true}).click();
    assert.equal(gifRequests, 0);
    await page.getByRole('button',{name:'Ver animação do exercício',exact:true}).click();
    const animation = page.getByRole('img',{name:'Demonstração animada: Agachamento Goblet',exact:true});
    await animation.waitFor();
    await page.waitForFunction(() => [...document.images].some(i => i.src.endsWith('.gif') && i.naturalWidth > 0));
    await page.screenshot({path:path.join(out,'media-details.png')});
    await page.getByRole('button',{name:'Ocultar animação',exact:true}).click();
    assert.equal(await animation.count(),0);
    // Every shipped pair must decode through the same HTTP paths used by the UI.
    const decoded = await page.evaluate(async urls => Promise.all(urls.map(url => new Promise(resolve => {
      const img = new Image(); img.onload=() => resolve(img.naturalWidth > 0); img.onerror=() => resolve(false); img.src=url;
    }))), media.flatMap(m => [m.photo_url,m.gif_url]).filter(Boolean));
    assert(decoded.every(Boolean));
    failImage=true; failGif=true;
    await page.reload(); await page.getByText('268 exercícios encontrados').waitFor();
    await search('Agachamento Goblet');
    await page.getByText('Sem foto',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Ver detalhes',exact:true}).click();
    await page.getByText('Foto ou imagem não disponível',{exact:true}).waitFor();
    const before = gifRequests;
    await page.getByRole('button',{name:'Ver animação do exercício',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Animação indisponível'}).waitFor();
    await page.getByText(/Segure kettlebell junto ao peito/).last().waitFor();
    assert.equal(gifRequests, before+1, 'Failed GIF must not loop requests');
    await page.screenshot({path:path.join(out,'media-failures.png')});
    failImage=false; failGif=false;
    await page.getByRole('button',{name:'Ocultar animação',exact:true}).click();
    await page.getByRole('button',{name:'Ver animação do exercício',exact:true}).click();
    await page.waitForFunction(() => [...document.images].some(i => i.src.endsWith('.gif') && i.naturalWidth > 0));
    await page.reload(); await page.getByText('268 exercícios encontrados').waitFor();
    await search('Glúteo Coice na Polia Baixa');
    await page.getByRole('button',{name:'Ver detalhes',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Ver animação do exercício',exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    console.log(`PASS catalogue/details, ${decoded.length} decoded assets, opt-in GIF, image/GIF failures, retry and rejected exercise`);
  } finally { await browser.close(); }
}
main().catch(error => {console.error(error);process.exitCode=1;});
