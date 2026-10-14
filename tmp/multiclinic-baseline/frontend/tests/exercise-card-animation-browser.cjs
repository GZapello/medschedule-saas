const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_EXERCISE_LIBRARY } = require('../../backend/dist/config/exercise-library.seed');
const { exerciseAnimation } = require('../../backend/dist/services/exercise-media');
const { matchesExercise } = require('../../backend/dist/services/personal-exercise-utils');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
const out = process.env.TEST_OUTPUT_DIR || path.join(__dirname, 'results');
const catalog = DEFAULT_EXERCISE_LIBRARY.map(ex => ({...ex, ...exerciseAnimation({...ex,tenant_id:'global',is_custom:0}),is_active:1,is_custom:0}));
const card = (page,id) => page.locator(`[data-exercise-thumbnail="${id}"]`);
const gifs = page => page.locator('[data-exercise-thumbnail] img[src$=".gif"]');
const expectCount = async (locator,n) => {
  await locator.page().waitForFunction(({selector,n}) => document.querySelectorAll(selector).length === n,
    {selector:'[data-exercise-thumbnail] img[src$=".gif"]',n});
  assert.equal(await locator.count(),n);
};
async function search(page,text,count=1) {
  const input = page.locator('input[type="text"]').first();
  await input.fill(text); await input.press('Enter');
  await page.getByText(`${count} exercícios encontrados`,{exact:true}).waitFor();
}
async function loaded(locator) {
  await locator.waitFor();
  await locator.evaluate(img => img.complete && img.naturalWidth > 0 ? true : new Promise((resolve,reject) => {
    img.addEventListener('load',resolve,{once:true}); img.addEventListener('error',reject,{once:true});
  }));
  assert(await locator.evaluate(img => img.naturalWidth > 0));
}
async function setup(browser,options={}) {
  const context=await browser.newContext(options), page=await context.newPage();
  const state={gifRequests:[],mediaRequests:[],errors:[],failGif:false,failWebp:false};
  page.on('pageerror',e=>state.errors.push(e.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base)return route.abort();
    if(url.pathname.startsWith('/exercise-media/'))state.mediaRequests.push(url.pathname);
    if(url.pathname.endsWith('.gif')){
      state.gifRequests.push(url.pathname);
      if(state.failGif)return route.fulfill({status:404,body:'Not found'});
    }
    if(state.failWebp && url.pathname.startsWith('/exercise-media/') && url.pathname.endsWith('.webp'))return route.fulfill({status:404,body:'Not found'});
    if(url.pathname.endsWith('/personal/exercises'))return route.fulfill({json:{exercises:catalog.filter(ex=>matchesExercise(ex,Object.fromEntries(url.searchParams)))}});
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:{}});
    return route.continue();
  });
  await page.goto(`${base}/tests/exercise-library.html`);
  await page.getByText('268 exercícios encontrados',{exact:true}).waitFor();
  assert.equal(state.gifRequests.length,0,'No GIF prefetch at library open');
  assert(state.mediaRequests.length<128,'Static thumbnails are lazy loaded');
  return {context,page,state};
}
async function main(){
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  fs.mkdirSync(out,{recursive:true});
  try{
    const {context,page,state}=await setup(browser,{viewport:{width:1440,height:1000}});
    await search(page,'Crucifixo Inclinado');
    const target=card(page,'ex-crucifixo-inclinado');
    await target.getByText('Passe o mouse para ver o movimento',{exact:true}).waitFor();
    assert.equal(state.gifRequests.length,0,'Searching does not fetch GIFs');
    const staticImage=target.locator('img[src$=".webp"]');
    await loaded(staticImage);
    await target.hover();
    await loaded(gifs(page));
    assert.equal(state.gifRequests.length,1);
    assert.equal(await staticImage.isVisible(),false);
    await page.screenshot({path:path.join(out,'gym-desktop-hover.png')});
    await page.mouse.move(0,0);
    await expectCount(gifs(page),0);
    assert(await staticImage.isVisible());
    await target.hover(); await loaded(gifs(page));
    assert(state.gifRequests.every(url=>url==='/exercise-media/ex-crucifixo-inclinado.gif'),'Stable URL permits browser cache reuse');
    // Opening detail stops the card; its existing animation remains explicit.
    await target.click();
    await expectCount(gifs(page),0);
    await page.getByRole('button',{name:'Ver animação do exercício',exact:true}).click();
    await loaded(page.locator('img[src$=".gif"]'));
    assert.equal(await page.locator('img[src$=".gif"]').count(),1);
    await page.reload(); await page.getByText('268 exercícios encontrados',{exact:true}).waitFor();
    await search(page,'Crucifixo Inclinado');
    state.failGif=true;
    const before=state.gifRequests.length;
    await target.hover();
    await page.waitForFunction(()=>!document.querySelector('[data-exercise-thumbnail] img[src$=".gif"]') && !document.body.textContent.includes('Passe o mouse para ver o movimento'));
    assert.equal(state.gifRequests.length,before+1,'A 404 causes one attempt only');
    assert(await target.locator('img[src$=".webp"]').isVisible());
    await page.mouse.move(0,0); await target.hover();
    assert.equal(await gifs(page).count(),0);
    assert.equal(state.gifRequests.length,before+1);
    // Broken new WEBP also uses the established image fallback.
    state.failWebp=true;
    await page.reload(); await page.getByText('268 exercícios encontrados',{exact:true}).waitFor();
    await search(page,'Crucifixo Inclinado');
    await page.getByText('Sem foto',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Ver detalhes',exact:true}).click();
    await page.getByText('Foto ou imagem não disponível',{exact:true}).waitFor();
    assert.deepEqual(state.errors,[]);
    await context.close();
    console.log('PASS desktop: lazy WEBP, no prefetch, hover/leave, stable URLs, single detail animation, GIF/WEBP 404 fallbacks');

    for(const viewport of [{width:390,height:844},{width:1024,height:1366}]){
      const {context,page,state}=await setup(browser,{viewport,hasTouch:true,isMobile:true});
      assert.equal(await page.evaluate(()=>innerWidth),viewport.width,'Harness uses the actual device CSS viewport');
      await search(page,'Crucifixo Inclinado');
      const target=card(page,'ex-crucifixo-inclinado');
      const play=target.getByRole('button',{name:'Ver movimento',exact:true});
      await play.waitFor();
      assert.equal(await target.getByText('Passe o mouse para ver o movimento',{exact:true}).count(),0);
      await play.tap(); await loaded(gifs(page));
      await target.getByRole('button',{name:'Voltar à imagem',exact:true}).tap();
      await expectCount(gifs(page),0);
      assert(await target.locator('img[src$=".webp"]').isVisible());
      await search(page,'',268);
      const first=card(page,'ex-supino-reto-barra'),second=card(page,'ex-supino-reto-halteres');
      await first.getByRole('button',{name:'Ver movimento',exact:true}).tap(); await loaded(gifs(page));
      await second.getByRole('button',{name:'Ver movimento',exact:true}).tap(); await loaded(gifs(page));
      assert.equal(await gifs(page).count(),1,'Only one card may animate on touch');
      assert.equal(await first.locator('img[src$=".gif"]').count(),0);
      await page.screenshot({path:path.join(out,`gym-touch-${viewport.width}.png`)});
      // Scrolling the active card out of view stops it even without mouseleave.
      await card(page,'ex-crucifixo-inclinado').scrollIntoViewIfNeeded();
      await card(page,catalog.at(-1).id).scrollIntoViewIfNeeded();
      await expectCount(gifs(page),0);
      await search(page,'Glúteo Coice na Polia Baixa');
      const noGif=card(page,'ex-gluteo-cabo-coice');
      assert.equal(await noGif.getByRole('button',{name:'Ver movimento',exact:true}).count(),0);
      await noGif.tap();
      assert.equal(await page.getByRole('button',{name:'Ver animação do exercício',exact:true}).count(),0);
      assert.deepEqual(state.errors,[]);
      await context.close();
      console.log(`PASS touch ${viewport.width}px: explicit play/restore, one active GIF, offscreen stop, exercise without GIF`);
    }
    // Playwright routing disables HTTP cache, so check native image reuse in a
    // fresh, unrouted context against the real static server.
    const cacheContext=await browser.newContext();
    const cachePage=await cacheContext.newPage();
    await cachePage.goto(`${base}/exercise-media/ex-crucifixo-inclinado.webp`);
    const cacheResult=await cachePage.evaluate(async()=>{
      const url='/exercise-media/ex-crucifixo-inclinado.gif';
      performance.clearResourceTimings();
      for(let i=0;i<2;i++){
        const img=new Image();
        await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;document.body.append(img);});
        img.remove();
      }
      return performance.getEntriesByType('resource').filter(e=>e.name.endsWith(url)).map(e=>({transferSize:e.transferSize,decodedBodySize:e.decodedBodySize}));
    });
    assert(cacheResult.length>0 && cacheResult[0].decodedBodySize>0);
    assert(cacheResult.length===1 || cacheResult.at(-1).transferSize===0,'Second image uses the browser cache without downloading GIF bytes again');
    await cacheContext.close();
    console.log('PASS native browser cache: unmount/remount reuses GIF bytes without another download');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
